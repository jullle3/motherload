import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import './style.css';
import { OrbitalGame, type ReturnSummary } from './game';
import {
  CONFIG,
  DISCOVERIES,
  MACHINES,
  MACHINE_KEYS,
  REGIONS,
  type Cost,
  type Machine,
  type Material,
} from './config';
import { StationView, type Selection } from './render';
import { StationStore, SAVE_KEY, SETTINGS_KEY } from './store';
import { StationAudio } from './audio';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const number = (n: number) => Math.floor(n).toLocaleString('en-US');
const duration = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    : s >= 60
      ? `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`
      : `${Math.ceil(s)}s`;
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
let game: OrbitalGame,
  view: StationView | undefined,
  writer = false,
  releaseLock: (() => void) | undefined;
const store = new StationStore(),
  audio = new StationAudio();
let tab = 'station',
  selected: Selection | null = null,
  discovery: number | null = null,
  candidate: OrbitalGame | null = null;
let settings = {
  low: false,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  muted: false,
};
try {
  const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
  for (const key of ['low', 'reduced', 'muted'] as const)
    if (typeof raw[key] === 'boolean') settings[key] = raw[key];
} catch {
  /* Optional preferences. */
}
audio.muted = settings.muted;
document.querySelector('#app')!.innerHTML = `
<header><a class="brand" href="/games/orbital-scrapyard/">ORBITAL<span>SCRAPYARD</span><i>✳</i></a><a class="home" href="/">← ALL GAMES</a><span class="header-caption">NOTHING GOES TO WASTE.</span><button id="fullscreen" title="Toggle fullscreen (F)">⛶ <span>FULLSCREEN</span></button><button id="settings">☷ <span>SETTINGS</span></button></header>
<div id="lock-screen" hidden><span class="eyebrow">STATION CONNECTION</span><h1>This station is open elsewhere.</h1><p id="lock-message">Another tab is managing this save. This tab is read-only. Close the other tab, then reconnect here.</p><button id="reconnect" class="primary">RECONNECT</button><a href="/">← Back to all games</a></div>
<main id="station-app" hidden><section class="economy" aria-label="Station resources"><div class="balance"><span class="resource-label">◉ AVAILABLE CREDITS</span><strong id="credits">0</strong><small id="income">Starting production…</small></div><div><span class="resource-label">▰ ALLOY</span><strong id="alloy">0</strong><small>FABRICATION MATERIAL</small></div><div><span class="resource-label">▧ CIRCUITS</span><strong id="circuits">0</strong><small>RESTORATION COMPONENTS</small></div><div class="station-bonus"><span class="resource-label">✳ STATION BONUS</span><strong id="bonus">+0%</strong><small>FROM YOUR COLLECTION</small></div></section>
<nav class="tabs" aria-label="Station views">${[
  ['station', '⌂', 'Station'],
  ['upgrades', '↑', 'Upgrades'],
  ['expeditions', '↗', 'Expeditions'],
  ['collection', '◇', 'Collection'],
]
  .map(
    ([id, icon, label]) =>
      `<button data-tab="${id}" aria-pressed="${id === 'station'}"><span>${icon}</span> ${label}</button>`,
  )
  .join('')}</nav>
<section class="workspace"><div class="world-wrap"><div class="world-caption"><span class="eyebrow">INDEPENDENT SALVAGE OPERATION</span><h1>A little station.<br>An endless sky.</h1><p id="region-caption">Satellite Belt / ONLINE</p></div><div id="world"></div><button id="overview" class="camera">⌖ FULL STATION</button><div class="world-footer"><span><i></i> AUTONOMOUS OPERATIONS</span><span id="worker-caption">1 DRONE ACTIVE</span></div></div><aside id="panel" aria-label="Station management"></aside></section>
<section class="machine-shortcuts" aria-label="Select a machine">${MACHINE_KEYS.map((k) => `<button data-machine="${k}">${MACHINES[k].name}</button>`).join('')}<button data-machine="market">Sales & reserves</button><button data-machine="bay">Restoration bay</button><button data-machine="dock">Ship-breaking dock</button></section>
<div id="notice" role="status" hidden></div><footer><span>GROW AT YOUR OWN PACE.</span><span>Up to 24 hours of offline production · Saved on this device</span><button id="export-footer">EXPORT SAVE ↗</button></footer></main>
<div id="toast" role="status" hidden></div><dialog id="dialog"><button id="close-dialog" aria-label="Close dialog">✕</button><div id="dialog-content"></div></dialog><input id="import-file" type="file" accept=".json,application/json" hidden>`;
let toastTimer = 0;
function toast(message: string) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ($('toast').hidden = true), 5000);
}
function modal(html: string) {
  $('dialog-content').innerHTML = html;
  const dialog = $<HTMLDialogElement>('dialog');
  if (!dialog.open) dialog.showModal();
}
$('close-dialog').onclick = () => $<HTMLDialogElement>('dialog').close();
function costText(cost: Cost) {
  return `${number(cost.credits)} cr${cost.alloy ? ` · ${number(cost.alloy)} alloy` : ''}${cost.circuits ? ` · ${number(cost.circuits)} circuits` : ''}`;
}
function costHelp(cost: Cost) {
  const tooSmall = cost.alloy >= game.capacity || cost.circuits >= game.capacity;
  return `<p class="cost">${costText(cost)}</p>${tooSmall ? '<p class="hint">Upgrade cargo buffers before reserving these materials, so surplus can still sell.</p>' : ''}${cost.alloy || cost.circuits ? `<button class="text-button" data-reserve-cost='${JSON.stringify(cost)}' ${tooSmall ? 'disabled' : ''}>Reserve materials for this</button>` : ''}`;
}
function upgrade(machine: Machine) {
  const level = game.e.levels[machine],
    definition = MACHINES[machine];
  return `<article class="upgrade-card"><div class="row"><h3>${definition.name}</h3><span class="level">${machine === 'electronics' && !level ? 'NOT INSTALLED' : `LEVEL ${level} / 10`}</span></div><p>${definition.description}</p><div class="rate">${game.rate(machine).toFixed(machine === 'storage' ? 0 : 2)} <small>${definition.unit}</small></div><div class="level-bars">${Array.from({ length: 10 }, (_, i) => `<i class="${i < level ? 'filled' : ''}"></i>`).join('')}</div><button class="primary full" data-buy="${machine}" ${level >= 10 || !game.afford(game.cost(machine)) ? 'disabled' : ''}>${level >= 10 ? 'FULLY UPGRADED' : `${machine === 'electronics' && !level ? 'INSTALL' : 'UPGRADE'} <span>${number(game.cost(machine).credits)} cr</span>`}</button></article>`;
}
function reserves() {
  return `<span class="eyebrow">SALES TERMINAL</span><h2>Keep what you need.<br>Sell the rest.</h2><p>Goods above these amounts sell automatically. Raise a reserve to save materials for construction or restoration.</p>${(['alloy', 'circuits'] as const).map((m) => `<label class="reserve-field"><span>${m === 'alloy' ? 'Alloy' : 'Circuits'} reserve <small>${number(game.e[m])} / ${game.capacity} in stock</small></span><input data-reserve="${m}" type="number" inputmode="numeric" min="0" max="${game.capacity}" step="1" value="${game.e.reserves[m]}" aria-label="${m} reserve"></label>`).join('')}<div class="info-box">${game.projected().afterReserves.toFixed(2)} cr / s projected after reserves<br><small>${game.projected().gross.toFixed(2)} cr / s once reserves are filled. Actual output depends on available inputs and buffer capacity.</small></div><p class="hint">Alloy sells for 5 cr; circuits sell for 14 cr. Until a recycler is installed, electronic scrap sells to traders for 1 cr each.</p>`;
}
function bay() {
  return `<span class="eyebrow">RESTORATION BAY</span><h2>A second life<br>for a first discovery.</h2><p>Restore finds for a profitable sale, or exhibit them for a permanent station bonus.</p>${!game.state.bay ? `${costHelp(CONFIG.bayCost)}<button class="primary full" data-build="bay" ${!game.afford(CONFIG.bayCost) ? 'disabled' : ''}>BUILD RESTORATION BAY ↗</button>` : `<div class="info-box">${game.state.queue.length} / 3 jobs queued · One workbench</div>${game.state.queue.length ? game.state.queue.map((job, i) => `<article class="job"><div class="row"><strong>${DISCOVERIES[job.discovery].name}</strong><span>${i ? 'QUEUED' : duration(job.remaining)}</span></div><small>${job.destination === 'sell' ? `Restore & sell for ${number(DISCOVERIES[job.discovery].sale)} cr` : 'Restore & display'}</small><div class="progress"><i style="width:${i ? 0 : (1 - job.remaining / DISCOVERIES[job.discovery].seconds) * 100}%"></i></div></article>`).join('') : '<p class="hint">Your workbench is ready. Choose a discovery from the collection.</p>'}<button class="secondary full" data-tab="collection">BROWSE DISCOVERIES →</button>`}`;
}
function dock() {
  return `<span class="eyebrow">THE NEXT BIG THING</span><h2>A home for<br>whole starships.</h2><p>Build a ship-breaking dock and turn your workshop into a full orbital salvage yard.</p>${game.state.dock ? '<div class="info-box success">DOCK OPERATIONAL<br>+25% production across the station.</div><p>The first chapter is complete. Keep upgrading your machines and filling the collection.</p>' : `<div class="milestone"><span>Lifetime earnings</span><strong>${number(game.e.earned)} / ${number(CONFIG.dockMilestone)} cr</strong><div class="progress"><i style="width:${Math.min(100, (game.e.earned / CONFIG.dockMilestone) * 100)}%"></i></div></div>${costHelp(CONFIG.dockCost)}<p class="hint">Requires access to the Alien Graveyard.</p><button class="primary full" data-build="dock" ${game.state.unlocked < 3 || game.e.earned < CONFIG.dockMilestone || !game.afford(CONFIG.dockCost) ? 'disabled' : ''}>CONSTRUCT SHIP-BREAKING DOCK ↗</button>`}`;
}
function station() {
  if (selected === 'market') return reserves();
  if (selected === 'bay') return bay();
  if (selected === 'dock') return dock();
  if (selected && selected in MACHINES)
    return `<span class="eyebrow">MACHINE INSPECTION</span>${upgrade(selected as Machine)}<div class="info-box">${game.bottleneck().title}<br><small>${game.bottleneck().detail}</small></div><h3>Production buffers</h3>${buffers()}`;
  const bottleneck = game.bottleneck();
  return `<span class="eyebrow">YOUR STATION, AT A GLANCE</span><h2>Small beginnings.<br>Useful things.</h2><p>Your drones are working. Turn forgotten scrap into something valuable, then invest in what comes next.</p><div class="info-box"><span class="eyebrow">NEXT OPPORTUNITY</span><h3>${bottleneck.title}</h3><p>${bottleneck.detail}</p><button class="text-button" data-machine="${bottleneck.machine}">INSPECT MACHINE →</button></div>${game.e.earned < 300 ? `<div class="first-goal"><span>First drone upgrade</span><strong>${number(game.e.credits)} / 50 cr</strong><div class="progress"><i style="width:${Math.min(100, (game.e.credits / 50) * 100)}%"></i></div><small>No clicking needed. Your first upgrade is on its way.</small></div>` : ''}<h3>Production buffers</h3>${buffers()}<button class="secondary full" data-machine="${game.state.bay ? 'dock' : 'bay'}">${game.state.bay ? 'EXPAND THE STATION' : 'BUILD A RESTORATION BAY'} ↗</button>`;
}
function buffers() {
  return `<div class="buffers">${[
    ['Incoming salvage', game.e.salvage.reduce((sum, n) => sum + n, 0)],
    ['Sorted metal', game.e.metal],
    ['Electronic scrap', game.e.electronicScrap],
  ]
    .map(
      ([label, value]) =>
        `<div><span>${label}</span><small>${number(value as number)} / ${game.capacity}</small><div class="progress"><i style="width:${(Number(value) / game.capacity) * 100}%"></i></div></div>`,
    )
    .join('')}</div>`;
}
function expeditions() {
  const current = game.state.expedition;
  return `<span class="eyebrow">THE SALVAGE FRONTIER</span><h2>There’s more<br>out there.</h2><div class="info-box"><div class="row"><strong>${REGIONS[current.region].name}</strong><span>${duration(current.remaining)}</span></div><div class="progress"><i style="width:${(1 - current.remaining / REGIONS[current.region].tripSeconds) * 100}%"></i></div><small>Next departure: ${REGIONS[game.state.selectedRegion].name}. Trips repeat automatically; your drones use the active trip’s region.</small></div>${REGIONS.map((r, i) => `<article class="region-card"><span class="eyebrow">REGION ${i + 1} · ${duration(r.tripSeconds)} TRIPS</span><h3>${r.name}</h3><p>${r.subtitle}</p><div class="tags"><span>${r.yield}× salvage</span><span>${Math.round(r.metal * 100)}% metal</span><span>${Math.round((1 - r.metal) * 100)}% electronics</span></div>${i < game.state.unlocked ? `<button class="${i === game.state.selectedRegion ? 'secondary' : 'primary'} full" data-region="${i}" ${i === game.state.selectedRegion ? 'disabled' : ''}>${i === game.state.selectedRegion ? 'SELECTED FOR NEXT TRIP' : 'SEND NEXT EXPEDITION HERE'}</button><small>Rare find guaranteed within ${r.pity} trips. Current streak: ${game.state.pity[i]}.</small>` : `<p class="hint">Lifetime earnings: ${number(game.e.earned)} / ${number(r.milestone)} cr</p>${costHelp(r.cost)}<button class="primary full" data-unlock="${i}" ${i !== game.state.unlocked || game.e.earned < r.milestone || !game.afford(r.cost) ? 'disabled' : ''}>OPEN SALVAGE ROUTE ↗</button>`}</article>`).join('')}`;
}
function discoveryArt(index: number, unknown = false) {
  const d = DISCOVERIES[index];
  return `<div class="find-art shape-${d.shape} ${unknown ? 'unknown' : ''}" style="--find-color:${unknown ? '#536875' : d.color}"><i></i><b></b><span>${unknown ? '?' : '✦'}</span></div>`;
}
function collection() {
  if (discovery !== null && game.state.seen[discovery]) {
    const d = DISCOVERIES[discovery],
      count = game.state.finds[discovery];
    const queued = game.state.queue.some(
      (job) => job.discovery === discovery && job.destination === 'display',
    );
    return `<button class="text-button" data-back-collection>← ALL DISCOVERIES</button>${discoveryArt(discovery)}<span class="eyebrow">${d.rare ? 'RARE FIND' : 'SALVAGED OBJECT'} · ${REGIONS[d.region].name}</span><h2>${d.name}</h2><p>${d.description}</p><div class="info-box">${number(count)} unrestored in storage${game.state.displayed[discovery] ? ` · Exhibited: +${d.bonus * 100}% production` : ''}</div><article class="choice"><h3>Dismantle</h3><p>Receive ${d.dismantle.alloy} alloy and ${d.dismantle.circuits} circuits immediately. This consumes one find.</p><button class="secondary full" data-dismantle="${discovery}" ${!count || game.e.alloy + d.dismantle.alloy > game.capacity || game.e.circuits + d.dismantle.circuits > game.capacity ? 'disabled' : ''}>DISMANTLE FOR MATERIALS</button><small>Needs room in material buffers. Materials above your reserves sell on the next production tick.</small></article><article class="choice"><h3>Restore</h3><p>${duration(d.seconds)} on the workbench. Spend:</p>${costHelp(d.restore)}${!game.state.bay ? '<button class="secondary full" data-machine="bay">BUILD THE RESTORATION BAY FIRST</button>' : `<button class="primary full" data-restore="${discovery}" data-destination="sell" ${!count || !game.afford(d.restore) || game.state.queue.length >= 3 ? 'disabled' : ''}>RESTORE & SELL <span>${number(d.sale)} cr</span></button><button class="secondary full" data-restore="${discovery}" data-destination="display" ${!count || !game.afford(d.restore) || game.state.queue.length >= 3 || game.state.displayed[discovery] || queued ? 'disabled' : ''}>${game.state.displayed[discovery] ? 'ALREADY EXHIBITED' : queued ? 'DISPLAY RESTORATION QUEUED' : `RESTORE & DISPLAY · +${Math.round(d.bonus * 100)}%`}</button><small>Display bonuses apply once per unique object. ${game.state.queue.length} / 3 workbench slots in use.</small>`}</article>`;
  }
  return `<span class="eyebrow">THE THINGS WE KEEP</span><h2>Someone’s history.<br>Your next discovery.</h2><p>${game.state.seen.filter(Boolean).length} / 12 discovered · ${game.state.displayed.filter(Boolean).length} exhibited. Finds arrive with expeditions, even when your production buffers are full.</p><div class="collection-grid">${DISCOVERIES.map((d, i) => `<button class="find-card" data-discovery="${i}" ${!game.state.seen[i] ? 'disabled' : ''}>${discoveryArt(i, !game.state.seen[i])}<strong>${game.state.seen[i] ? d.name : 'Unknown signal'}</strong><small>${game.state.seen[i] ? `${number(game.state.finds[i])} in storage${game.state.displayed[i] ? ' · EXHIBITED' : d.rare ? ' · RARE' : ''}` : `Region ${d.region + 1}`}</small></button>`).join('')}</div><button class="secondary full" data-machine="bay">RESTORATION WORKBENCH →</button>`;
}
function render() {
  if (!game || !writer) return;
  $('credits').textContent = number(game.e.credits);
  $('alloy').textContent = number(game.e.alloy);
  $('circuits').textContent = number(game.e.circuits);
  $('income').textContent = `${game.projected().afterReserves.toFixed(2)} cr / s after reserves`;
  $('bonus').textContent = `+${Math.round((game.bonus - 1) * 100)}%`;
  $('region-caption').textContent =
    `${REGIONS[game.state.expedition.region].name.toUpperCase()} / ONLINE`;
  $('worker-caption').textContent =
    `${1 + Math.floor(game.e.levels.drone / 3)} DRONE${game.e.levels.drone >= 3 ? 'S' : ''} ACTIVE`;
  $('notice').textContent = store.notice;
  $('notice').hidden = !store.notice;
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
  });
  if (
    $('panel').contains(document.activeElement) &&
    document.activeElement instanceof HTMLInputElement
  )
    return;
  const html =
    tab === 'station'
      ? station()
      : tab === 'upgrades'
        ? `<span class="eyebrow">A BETTER WORKING DAY</span><h2>Make room<br>for more.</h2>${MACHINE_KEYS.map(upgrade).join('')}`
        : tab === 'expeditions'
          ? expeditions()
          : collection();
  if ($('panel').innerHTML !== html) $('panel').innerHTML = html;
}
function act(action: () => boolean, message: string) {
  if (!writer) return;
  game.advance();
  if (action()) {
    store.write(game);
    audio.start();
    audio.play();
    toast(message);
  } else toast('Not ready yet. Check materials, capacity, and requirements.');
  render();
}
function selectMachine(id: Selection) {
  selected = id;
  tab = 'station';
  discovery = null;
  view?.select(id);
  render();
  $('panel').scrollTop = 0;
}
document.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button || button.disabled || !writer) return;
  const d = button.dataset;
  if (d.tab) {
    tab = d.tab;
    discovery = null;
    render();
    $('panel').scrollTop = 0;
  }
  if (d.machine) selectMachine(d.machine as Selection);
  if (d.buy)
    act(() => game.buy(d.buy as Machine), 'Upgrade installed. A little more room to grow.');
  if (d.reserveCost) {
    game.advance();
    game.reserveFor(JSON.parse(d.reserveCost));
    store.write(game);
    render();
    toast('Material reserves set. Production will fill them automatically.');
  }
  if (d.build === 'bay')
    act(() => game.buildBay(), 'Restoration bay ready. Give a discovery a second life.');
  if (d.build === 'dock')
    act(() => game.buildDock(), 'Ship-breaking dock operational! Your first chapter is complete.');
  if (d.unlock)
    act(
      () => game.unlockRegion(Number(d.unlock)),
      'New route unlocked. Your next expedition will explore it.',
    );
  if (d.region !== undefined) {
    game.advance();
    game.selectRegion(Number(d.region));
    store.write(game);
    render();
  }
  if (d.discovery !== undefined) {
    discovery = Number(d.discovery);
    render();
    $('panel').scrollTop = 0;
  }
  if ('backCollection' in d) {
    discovery = null;
    render();
    $('panel').scrollTop = 0;
  }
  if (d.dismantle !== undefined)
    act(() => game.dismantle(Number(d.dismantle)), 'Find dismantled. Materials added to storage.');
  if (d.restore !== undefined)
    act(
      () => game.queueRestore(Number(d.restore), d.destination as 'sell' | 'display'),
      'Restoration queued. The workbench will take it from here.',
    );
});
$('panel').addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement;
  if (!writer || !input.dataset.reserve) return;
  game.advance();
  game.reserve(input.dataset.reserve as Material, Number(input.value));
  input.value = String(game.e.reserves[input.dataset.reserve as Material]);
  store.write(game);
  render();
});
$('overview').onclick = () => {
  selected = null;
  view?.select(null);
  tab = 'station';
  render();
};
function returnModal(summary: ReturnSummary) {
  modal(
    `<span class="eyebrow">WELCOME BACK, CAPTAIN</span><h2>We kept things moving.</h2><p>${duration(summary.credited)} of production${summary.capped ? ' credited. Offline progress is capped at 24 hours per absence' : ' while you were away'}.</p><div class="return-grid"><div><strong>+${number(summary.credits)}</strong><span>CREDITS</span></div><div><strong>${summary.alloy >= 0 ? '+' : ''}${number(summary.alloy)}</strong><span>ALLOY CHANGE</span></div><div><strong>${summary.circuits >= 0 ? '+' : ''}${number(summary.circuits)}</strong><span>CIRCUITS CHANGE</span></div><div><strong>${summary.finds.reduce((a, b) => a + b, 0)}</strong><span>FINDS RECOVERED</span></div></div><p>${summary.restored} restorations completed.</p>${summary.finds.map((n, i) => (n ? `<div class="return-find">${DISCOVERIES[i].name}<strong>+${n}</strong></div>` : '')).join('')}<div class="info-box">${summary.bottleneck}</div><p class="hint">Everything has already been added. Production follows the same machine speeds and storage limits while you’re away.</p><button class="primary full" id="return-close">BACK TO THE STATION ↗</button>`,
  );
  $('return-close').onclick = () => $<HTMLDialogElement>('dialog').close();
}
function exportSave() {
  if (!writer || !game) return;
  game.advance();
  store.write(game);
  const url = URL.createObjectURL(new Blob([store.export(game)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'orbital-scrapyard-save.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$('export-footer').onclick = exportSave;
function showSettings() {
  if (!writer) return;
  modal(
    `<span class="eyebrow">STATION PREFERENCES</span><h2>Your corner of orbit.</h2><div class="settings-list"><label><span>Sound effects</span><input id="sound-setting" type="checkbox" ${!settings.muted ? 'checked' : ''}></label><label><span>Lower visual effects</span><input id="low-setting" type="checkbox" ${settings.low ? 'checked' : ''}></label><label><span>Reduced motion</span><input id="motion-setting" type="checkbox" ${settings.reduced ? 'checked' : ''}></label></div><h3>Keep a backup</h3><p>Saves stay in this browser. Export a file to keep a backup or transfer your station to another device.</p><div class="dialog-actions"><button id="export" class="primary">EXPORT SAVE</button><button id="import" class="secondary">IMPORT SAVE</button></div>${store.protectedOriginal ? '<div class="info-box">The unreadable original save is still preserved.</div><button id="replace-old" class="secondary full">REPLACE OLD SAVE WITH THIS STATION</button>' : ''}<p class="hint">Importing requires confirmation and does not award offline progress. No account is needed.</p>`,
  );
  const setting = (id: string, key: keyof typeof settings, inverse = false) =>
    ($<HTMLInputElement>(id).onchange = (e) => {
      settings[key] = inverse
        ? !(e.target as HTMLInputElement).checked
        : (e.target as HTMLInputElement).checked;
      audio.muted = settings.muted;
      audio.start();
      if (view) {
        view.low = settings.low;
        view.reduced = settings.reduced;
        view.resize();
      }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        /* Optional preferences. */
      }
    });
  setting('sound-setting', 'muted', true);
  setting('low-setting', 'low');
  setting('motion-setting', 'reduced');
  $('export').onclick = exportSave;
  $('import').onclick = () => $<HTMLInputElement>('import-file').click();
  if (store.protectedOriginal)
    $('replace-old').onclick = () => {
      modal(
        '<h2>Replace the preserved save?</h2><p>This explicitly replaces the unreadable original with the station running in this tab.</p><button id="confirm-replace" class="primary full">REPLACE WITH CURRENT STATION</button>',
      );
      $('confirm-replace').onclick = () => {
        game.advance();
        store.write(game, true);
        $<HTMLDialogElement>('dialog').close();
        render();
      };
    };
}
$('settings').onclick = showSettings;
$<HTMLInputElement>('import-file').onchange = async (e) => {
  const input = e.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = '';
  if (!file || !writer) return;
  try {
    if (file.size > 1000000) throw new Error('Save file is too large.');
    candidate = store.import(await file.text());
    modal(
      `<span class="eyebrow">REVIEW BEFORE REPLACING</span><h2>Bring this station home?</h2><p>This replaces your current station. Export it first if you want to keep both.</p><div class="info-box">${number(candidate.e.credits)} credits<br>${candidate.state.unlocked} regions unlocked<br>${candidate.state.seen.filter(Boolean).length} discoveries<br>${candidate.state.dock ? 'Ship-breaking dock operational' : 'Dock not yet built'}</div><div class="dialog-actions"><button class="primary" id="confirm-import">REPLACE CURRENT STATION</button><button class="secondary" id="cancel-import">KEEP MY STATION</button></div>`,
    );
    $('cancel-import').onclick = () => {
      candidate = null;
      $<HTMLDialogElement>('dialog').close();
    };
    $('confirm-import').onclick = () => {
      if (!candidate || !writer) return;
      candidate.state.lastAt = Date.now();
      candidate.state.carryMs = 0;
      game = candidate;
      candidate = null;
      store.write(game, true);
      selected = null;
      discovery = null;
      tab = 'station';
      view?.select(null);
      $<HTMLDialogElement>('dialog').close();
      render();
      toast('Station imported. Welcome to your new shift.');
    };
  } catch (error) {
    toast(
      `Import failed: ${error instanceof Error ? error.message : 'Invalid save file'}. Your current station is unchanged.`,
    );
  }
};
let fullscreenPending = false;
function syncFullscreen() {
  const b = $<HTMLButtonElement>('fullscreen');
  b.disabled = !document.fullscreenEnabled || fullscreenPending;
  b.setAttribute('aria-pressed', String(!!document.fullscreenElement));
  b.innerHTML = `⛶ <span>${document.fullscreenElement ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}</span>`;
}
$('fullscreen').onclick = async () => {
  fullscreenPending = true;
  syncFullscreen();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast('Fullscreen is unavailable in this view. Try a separate browser tab.');
  } finally {
    fullscreenPending = false;
    syncFullscreen();
  }
};
document.addEventListener('fullscreenchange', () => {
  syncFullscreen();
  view?.resize();
});
window.addEventListener('keydown', (e) => {
  if (
    e.code === 'KeyF' &&
    !e.repeat &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    !(e.target instanceof HTMLInputElement)
  ) {
    e.preventDefault();
    $<HTMLButtonElement>('fullscreen').click();
  }
});
window.addEventListener('resize', () => view?.resize());
document.addEventListener('pointerdown', () => audio.start(), { once: true });
let frameId = 0,
  lastFrame = performance.now();
function frame(now: number) {
  frameId = 0;
  if (!writer || document.hidden) return;
  view?.draw(game, Math.min(0.05, (now - lastFrame) / 1000));
  lastFrame = now;
  frameId = requestAnimationFrame(frame);
}
function startFrames() {
  lastFrame = performance.now();
  if (!frameId && !document.hidden) frameId = requestAnimationFrame(frame);
}
function catchUp(show = true) {
  if (!writer || !game) return;
  const trips = game.state.trips;
  const summary = game.advance();
  if (game.state.trips > trips) audio.play(true);
  store.write(game);
  render();
  if (show && summary.elapsed >= 60) returnModal(summary);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (writer && game) {
      game.advance();
      store.write(game);
    }
    cancelAnimationFrame(frameId);
    frameId = 0;
  } else {
    catchUp();
    startFrames();
  }
});
window.setInterval(() => {
  if (writer && !document.hidden) catchUp(false);
}, 1000);
window.addEventListener('pagehide', () => {
  if (writer && game) {
    game.advance();
    store.write(game);
  }
  writer = false;
  releaseLock?.();
  cancelAnimationFrame(frameId);
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});
async function boot() {
  if (!navigator.locks) {
    $('lock-screen').hidden = false;
    $('lock-message').textContent =
      'This browser does not support safe single-tab saving. Open the site in a current Chrome, Edge, Firefox, or Safari browser.';
    return;
  }
  await navigator.locks
    .request(SAVE_KEY, { ifAvailable: true }, async (lock) => {
      if (!lock) {
        $('lock-screen').hidden = false;
        return;
      }
      writer = true;
      game = store.read();
      const summary = game.advance();
      store.write(game);
      $('station-app').hidden = false;
      $('lock-screen').hidden = true;
      try {
        view = new StationView($('world'), selectMachine);
        view.low = settings.low;
        view.reduced = settings.reduced;
        view.resize();
      } catch {
        $('world').innerHTML =
          '<p class="graphics-fallback">3D could not start. You can still manage your station using the controls below.</p>';
      }
      render();
      startFrames();
      if (summary.elapsed >= 60) returnModal(summary);
      await new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
    })
    .catch(() => {
      $('lock-screen').hidden = false;
      $('lock-message').textContent =
        'The station could not acquire its save lock. Try reconnecting.';
    });
}
$('reconnect').onclick = () => location.reload();
syncFullscreen();
void boot();
