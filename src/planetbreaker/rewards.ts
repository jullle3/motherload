import { BOOSTS, type BoostKey } from './config';
import type { Reward } from './game';

export class RewardView {
  private drone: HTMLButtonElement;
  private collect: HTMLButtonElement;
  private badge: HTMLElement;
  private burst: HTMLElement;
  private announcement: HTMLElement;
  private last: BoostKey | null = null;
  private burstUntil = 0;
  constructor(
    private host: HTMLElement,
    collect: () => void,
  ) {
    const root = document.createElement('div');
    root.className = 'reward-layer';
    root.innerHTML = `<button id="reward-drone" class="reward-drone" hidden><span class="drone-trail"></span><svg viewBox="0 0 120 80" aria-hidden="true"><defs><linearGradient id="drone-metal" x2="1" y2="1"><stop stop-color="#8fb2c9"/><stop offset=".5" stop-color="#314456"/><stop offset="1" stop-color="#102334"/></linearGradient></defs><ellipse class="drone-orbit" cx="63" cy="40" rx="28" ry="28"/><path class="drone-wing" d="M48 28 22 13l-9 8 23 20-23 18 9 8 26-16m25-23 21-12 13 6-22 18 22 19-13 7-21-15"/><path fill="url(#drone-metal)" stroke="#9bbdd0" d="m39 29 24-14 23 14v22L63 66 39 51Z"/><path class="drone-light" d="m49 33 14-8 13 8v14l-13 8-14-8Z"/><path fill="#efffff" d="m60 32 8 8-8 8-5-8Z"/><path class="drone-light" d="M18 20h13v4H18zm0 38h13v4H18z"/></svg><span class="drone-label">SUPPLY DRONE</span></button><button id="collect-reward" class="collect-reward" hidden></button><div id="boost-badge" class="boost-badge" hidden><span class="boost-icon"></span><div><strong></strong><small></small><div class="boost-track"><i></i></div></div><b></b></div><div class="collection-burst" hidden><i></i><i></i><span></span></div><span class="sr-only" role="status" aria-live="polite"></span>`;
    host.append(root);
    this.drone = root.querySelector('.reward-drone')!;
    this.collect = root.querySelector('.collect-reward')!;
    this.badge = root.querySelector('.boost-badge')!;
    this.burst = root.querySelector('.collection-burst')!;
    this.announcement = root.querySelector('[role=status]')!;
    this.drone.onclick = this.collect.onclick = (e) => {
      e.stopPropagation();
      collect();
    };
    this.drone.onpointerdown = this.collect.onpointerdown = (e) => e.stopPropagation();
  }
  collected(key: BoostKey, reduced: boolean) {
    const def = BOOSTS[key];
    this.burst.style.setProperty('--reward', def.color);
    this.burst.style.left = this.drone.style.left;
    this.burst.style.top = this.drone.style.top;
    this.burst.classList.toggle('quiet', reduced);
    this.burst.querySelector('span')!.textContent = `${def.name.toUpperCase()} ONLINE`;
    this.burst.hidden = false;
    this.burstUntil = performance.now() + 1200;
    this.burst.getAnimations({ subtree: true }).forEach((a) => {
      a.cancel();
      a.play();
    });
    this.announcement.textContent = `${def.name} activated. ${def.benefit}. 30 seconds.`;
  }
  update(r: Reward, reduced: boolean, complete: boolean) {
    this.host.dataset.boost = r.active ?? '';
    this.host.classList.toggle('reduced-rewards', reduced);
    this.drone.hidden = this.collect.hidden = !r.available || complete;
    if (r.available && !complete) {
      const def = BOOSTS[r.available],
        progress = 1 - r.flyRemaining / 14;
      this.drone.style.setProperty('--reward', def.color);
      this.collect.style.setProperty('--reward', def.color);
      this.drone.style.left = `${reduced ? this.host.clientWidth * 0.5 : 64 + progress * Math.max(0, this.host.clientWidth - 128)}px`;
      this.drone.style.top = `${this.host.clientHeight * (reduced ? 0.37 : 0.4 + Math.sin(progress * Math.PI * 2) * 0.11)}px`;
      this.drone.setAttribute('aria-label', `Collect ${def.name}`);
      this.drone.querySelector('.drone-label')!.textContent = def.name.toUpperCase();
      this.collect.textContent = `${def.icon} COLLECT ${def.name.toUpperCase()} · ${Math.ceil(r.flyRemaining)}s`;
      if (this.last !== r.available)
        this.announcement.textContent = `${def.name} drone approaching. Collect for ${def.benefit}.`;
    }
    this.last = r.available;
    this.badge.hidden = !r.active || complete;
    if (r.active && !complete) {
      const def = BOOSTS[r.active];
      this.badge.style.setProperty('--reward', def.color);
      this.badge.querySelector('.boost-icon')!.textContent = def.icon;
      this.badge.querySelector('strong')!.textContent = `${def.name.toUpperCase()} ACTIVE`;
      this.badge.querySelector('small')!.textContent = def.benefit;
      this.badge.querySelector('b')!.textContent = `${Math.ceil(r.remaining)}s`;
      (this.badge.querySelector('.boost-track i') as HTMLElement).style.width =
        `${(r.remaining / 30) * 100}%`;
    }
    if (performance.now() > this.burstUntil) this.burst.hidden = true;
  }
}
