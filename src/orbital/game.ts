import {
  CONFIG,
  DISCOVERIES,
  MACHINES,
  MACHINE_KEYS,
  REGIONS,
  RECIPES,
  type Cost,
  type Machine,
  type Material,
} from './config';
export interface Restoration {
  discovery: number;
  destination: 'sell' | 'display';
  remaining: number;
}
export interface EconomyState {
  credits: number;
  earned: number;
  salvage: number[];
  metal: number;
  electronicScrap: number;
  alloy: number;
  circuits: number;
  reserves: Record<Material, number>;
  levels: Record<Machine, number>;
}
export interface SaveData {
  version: 1;
  lastAt: number;
  carryMs: number;
  seed: number;
  economy: EconomyState;
  unlocked: number;
  selectedRegion: number;
  expedition: { region: number; remaining: number };
  pity: number[];
  finds: number[];
  seen: boolean[];
  displayed: boolean[];
  queue: Restoration[];
  bay: boolean;
  dock: boolean;
  playedSeconds: number;
  trips: number;
  restorations: number;
}
export interface ReturnSummary {
  elapsed: number;
  credited: number;
  capped: boolean;
  credits: number;
  alloy: number;
  circuits: number;
  finds: number[];
  restored: number;
  bottleneck: string;
}
export interface Bottleneck {
  machine: Machine;
  title: string;
  detail: string;
}
export class OrbitalGame {
  state: SaveData;
  constructor(now = Date.now(), seed = Math.floor(Math.random() * 4294967296)) {
    this.state = {
      version: 1,
      lastAt: now,
      carryMs: 0,
      seed: seed >>> 0,
      economy: {
        credits: 0,
        earned: 0,
        salvage: [0, 0, 0],
        metal: 0,
        electronicScrap: 0,
        alloy: 0,
        circuits: 0,
        reserves: { alloy: 5, circuits: 0 },
        levels: { drone: 0, sorter: 0, furnace: 0, electronics: 0, storage: 0 },
      },
      unlocked: 1,
      selectedRegion: 0,
      expedition: { region: 0, remaining: REGIONS[0].tripSeconds },
      pity: [0, 0, 0],
      finds: DISCOVERIES.map(() => 0),
      seen: DISCOVERIES.map(() => false),
      displayed: DISCOVERIES.map(() => false),
      queue: [],
      bay: false,
      dock: false,
      playedSeconds: 0,
      trips: 0,
      restorations: 0,
    };
  }
  get e() {
    return this.state.economy;
  }
  get bonus() {
    return (
      1 +
      this.state.displayed.reduce((sum, shown, i) => sum + (shown ? DISCOVERIES[i].bonus : 0), 0) +
      (this.state.dock ? CONFIG.dockBonus : 0)
    );
  }
  get capacity() {
    return Math.floor(
      MACHINES.storage.baseRate * MACHINES.storage.rateGrowth ** this.e.levels.storage,
    );
  }
  rate(machine: Machine) {
    if (machine === 'storage') return this.capacity;
    if (machine === 'electronics' && this.e.levels.electronics === 0) return 0;
    const level = this.e.levels[machine] - (machine === 'electronics' ? 1 : 0);
    const definition = MACHINES[machine];
    return definition.baseRate * definition.rateGrowth ** level * this.bonus;
  }
  cost(machine: Machine): Cost {
    return {
      credits: Math.ceil(
        MACHINES[machine].baseCost * MACHINES[machine].costGrowth ** this.e.levels[machine],
      ),
      alloy: 0,
      circuits: 0,
    };
  }
  afford(cost: Cost) {
    return (
      this.e.credits + 1e-7 >= cost.credits &&
      this.e.alloy + 1e-7 >= cost.alloy &&
      this.e.circuits + 1e-7 >= cost.circuits
    );
  }
  private pay(cost: Cost) {
    this.e.credits = Math.max(0, this.e.credits - cost.credits);
    this.e.alloy = Math.max(0, this.e.alloy - cost.alloy);
    this.e.circuits = Math.max(0, this.e.circuits - cost.circuits);
  }
  private earn(amount: number) {
    this.e.credits += amount;
    this.e.earned += amount;
  }
  buy(machine: Machine) {
    if (
      !MACHINES[machine] ||
      this.e.levels[machine] >= CONFIG.maxLevel ||
      !this.afford(this.cost(machine))
    )
      return false;
    this.pay(this.cost(machine));
    this.e.levels[machine]++;
    return true;
  }
  reserve(material: Material, amount: number) {
    if (!Number.isFinite(amount) || !(material in this.e.reserves)) return;
    this.e.reserves[material] = Math.max(0, Math.min(this.capacity, Math.floor(amount)));
  }
  reserveFor(cost: Cost) {
    if (Math.max(cost.alloy, cost.circuits) >= this.capacity) return false;
    this.reserve('alloy', Math.max(this.e.reserves.alloy, cost.alloy));
    this.reserve('circuits', Math.max(this.e.reserves.circuits, cost.circuits));
    return true;
  }
  buildBay() {
    if (this.state.bay || !this.afford(CONFIG.bayCost)) return false;
    this.pay(CONFIG.bayCost);
    this.state.bay = true;
    return true;
  }
  unlockRegion(index: number) {
    const region = REGIONS[index];
    if (
      !region ||
      index !== this.state.unlocked ||
      this.e.earned < region.milestone ||
      !this.afford(region.cost)
    )
      return false;
    this.pay(region.cost);
    this.state.unlocked++;
    this.state.selectedRegion = index;
    return true;
  }
  selectRegion(index: number) {
    if (Number.isInteger(index) && index >= 0 && index < this.state.unlocked)
      this.state.selectedRegion = index;
  }
  buildDock() {
    if (
      this.state.dock ||
      this.state.unlocked < 3 ||
      this.e.earned < CONFIG.dockMilestone ||
      !this.afford(CONFIG.dockCost)
    )
      return false;
    this.pay(CONFIG.dockCost);
    this.state.dock = true;
    return true;
  }
  dismantle(index: number) {
    const discovery = DISCOVERIES[index];
    if (!discovery || this.state.finds[index] < 1) return false;
    // Dismantling is explicit and never discards material because a buffer is full.
    if (
      this.e.alloy + discovery.dismantle.alloy > this.capacity ||
      this.e.circuits + discovery.dismantle.circuits > this.capacity
    )
      return false;
    this.state.finds[index]--;
    this.e.alloy += discovery.dismantle.alloy;
    this.e.circuits += discovery.dismantle.circuits;
    return true;
  }
  queueRestore(index: number, destination: 'sell' | 'display') {
    const d = DISCOVERIES[index];
    if (
      !d ||
      !['sell', 'display'].includes(destination) ||
      !this.state.bay ||
      this.state.finds[index] < 1 ||
      this.state.queue.length >= CONFIG.queueLimit ||
      !this.afford(d.restore)
    )
      return false;
    if (
      destination === 'display' &&
      (this.state.displayed[index] ||
        this.state.queue.some((job) => job.discovery === index && job.destination === 'display'))
    )
      return false;
    this.pay(d.restore);
    this.state.finds[index]--;
    this.state.queue.push({ discovery: index, destination, remaining: d.seconds });
    return true;
  }
  private random() {
    let seed = this.state.seed;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    this.state.seed = seed >>> 0 || 1831565813;
    return this.state.seed / 4294967296;
  }
  private expeditionComplete() {
    const region = this.state.expedition.region;
    const roll = this.random();
    let local = 3,
      cumulative = 0;
    for (let i = 0; i < CONFIG.rareWeights.length; i++) {
      cumulative += CONFIG.rareWeights[i];
      if (roll < cumulative) {
        local = i;
        break;
      }
    }
    if (this.state.pity[region] >= REGIONS[region].pity - 1 && local < 2)
      local = roll < 0.5 ? 2 : 3;
    this.state.pity[region] = local >= 2 ? 0 : this.state.pity[region] + 1;
    const index = region * 4 + local;
    this.state.finds[index]++;
    this.state.seen[index] = true;
    this.state.trips++;
    this.state.expedition = {
      region: this.state.selectedRegion,
      remaining: REGIONS[this.state.selectedRegion].tripSeconds,
    };
  }
  private tick() {
    const e = this.e,
      cap = this.capacity;
    for (const recipe of RECIPES) {
      const output = Math.max(
        0,
        Math.min(
          this.rate(recipe.machine),
          e[recipe.input] / recipe.inputPerOutput,
          cap - e[recipe.output],
        ),
      );
      e[recipe.input] -= output * recipe.inputPerOutput;
      e[recipe.output] += output;
    }
    if (e.levels.electronics === 0) {
      this.earn(e.electronicScrap * CONFIG.scrapElectronicsPrice);
      e.electronicScrap = 0;
    }
    for (const material of ['alloy', 'circuits'] as const) {
      const amount = Math.max(0, e[material] - e.reserves[material]);
      e[material] -= amount;
      this.earn(amount * (material === 'alloy' ? CONFIG.alloyPrice : CONFIG.circuitPrice));
    }
    let sorting = this.rate('sorter');
    for (let region = 0; region < 3 && sorting > 1e-9; region++) {
      const metal = REGIONS[region].metal;
      const amount = Math.max(
        0,
        Math.min(
          sorting,
          e.salvage[region],
          (cap - e.metal) / metal,
          (cap - e.electronicScrap) / (1 - metal),
        ),
      );
      e.salvage[region] = Math.max(0, e.salvage[region] - amount);
      sorting -= amount;
      e.metal += amount * metal;
      e.electronicScrap += amount * (1 - metal);
    }
    const region = this.state.expedition.region;
    const scrap = Math.min(
      this.rate('drone') * REGIONS[region].yield,
      Math.max(0, cap - e.salvage.reduce((sum, n) => sum + n, 0)),
    );
    e.salvage[region] += scrap;
    this.state.expedition.remaining--;
    if (this.state.expedition.remaining <= 0) this.expeditionComplete();
    const job = this.state.queue[0];
    if (job) {
      job.remaining--;
      if (job.remaining <= 0) {
        if (job.destination === 'display') this.state.displayed[job.discovery] = true;
        else this.earn(DISCOVERIES[job.discovery].sale);
        this.state.restorations++;
        this.state.queue.shift();
      }
    }
    this.state.playedSeconds++;
  }
  advance(now = Date.now()): ReturnSummary {
    const elapsed = Math.max(0, (now - this.state.lastAt) / 1000);
    const credited = Math.min(CONFIG.offlineSeconds, elapsed);
    const before = {
      credits: this.e.credits,
      alloy: this.e.alloy,
      circuits: this.e.circuits,
      finds: [...this.state.finds],
      restored: this.state.restorations,
    };
    const totalMs = Math.round(credited * 1000) + this.state.carryMs;
    const ticks = Math.floor(totalMs / 1000);
    this.state.carryMs = totalMs % 1000;
    // A bounded one-second economy step gives identical online and offline outcomes.
    for (let i = 0; i < ticks; i++) this.tick();
    this.state.lastAt = Math.max(this.state.lastAt, now);
    return {
      elapsed,
      credited,
      capped: elapsed > CONFIG.offlineSeconds,
      credits: this.e.credits - before.credits,
      alloy: this.e.alloy - before.alloy,
      circuits: this.e.circuits - before.circuits,
      finds: this.state.finds.map((n, i) => n - before.finds[i]),
      restored: this.state.restorations - before.restored,
      bottleneck: this.bottleneck().title,
    };
  }
  projected() {
    const region = REGIONS[this.state.expedition.region],
      throughput = Math.min(
        this.rate('drone') * region.yield,
        this.rate('sorter'),
        (this.rate('furnace') * 2) / region.metal,
        this.e.levels.electronics > 0
          ? (this.rate('electronics') * 2) / (1 - region.metal)
          : Infinity,
      );
    const alloy = Math.min((throughput * region.metal) / 2, this.rate('furnace'));
    const circuits = Math.min((throughput * (1 - region.metal)) / 2, this.rate('electronics'));
    return {
      alloy,
      circuits,
      gross:
        alloy * 5 +
        circuits * 14 +
        (this.e.levels.electronics === 0 ? throughput * (1 - region.metal) : 0),
      afterReserves:
        this.e.reserves.alloy >= this.capacity ||
        (this.e.levels.electronics > 0 && this.e.reserves.circuits >= this.capacity)
          ? 0
          : (this.e.alloy + 0.001 >= this.e.reserves.alloy ? alloy * 5 : 0) +
            (this.e.circuits + 0.001 >= this.e.reserves.circuits ? circuits * 14 : 0) +
            (this.e.levels.electronics === 0 ? throughput * (1 - region.metal) : 0),
    };
  }
  bottleneck(): Bottleneck {
    const cap = this.capacity;
    if (
      this.e.reserves.alloy >= cap ||
      (this.e.levels.electronics > 0 && this.e.reserves.circuits >= cap)
    )
      return {
        machine: 'storage',
        title: 'Material reserves are full',
        detail: 'Lower the reserve to sell surplus, spend materials, or expand cargo buffers.',
      };
    const region = REGIONS[this.state.expedition.region];
    const limits: [Machine, number][] = [
      ['drone', this.rate('drone') * region.yield],
      ['sorter', this.rate('sorter')],
      ['furnace', (this.rate('furnace') * 2) / region.metal],
    ];
    if (this.e.levels.electronics > 0)
      limits.push(['electronics', (this.rate('electronics') * 2) / (1 - region.metal)]);
    const [machine] = limits.sort((a, b) => a[1] - b[1])[0];
    return {
      machine,
      title: `${MACHINES[machine].name} sets the pace`,
      detail:
        this.e.levels[machine] >= 10
          ? 'This machine is fully upgraded. Exhibit discoveries or build the ship-breaking dock for a station-wide production bonus.'
          : `Upgrade ${MACHINES[machine].name.toLowerCase()} to raise the production line’s throughput.`,
    };
  }
  save(): SaveData {
    return structuredClone(this.state);
  }
  static load(raw: unknown): OrbitalGame {
    const s = raw as SaveData;
    const finite = (v: unknown, max = 1e15): v is number =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
    const integer = (v: unknown, max: number) => finite(v, max) && Number.isInteger(v);
    if (
      !s ||
      s.version !== 1 ||
      !finite(s.lastAt, 9e15) ||
      !integer(s.carryMs, 999) ||
      !integer(s.seed, 4294967295) ||
      !s.economy ||
      !integer(s.unlocked, 3) ||
      s.unlocked < 1 ||
      !integer(s.selectedRegion, s.unlocked - 1) ||
      !s.expedition ||
      !integer(s.expedition.region, s.unlocked - 1) ||
      !integer(s.expedition.remaining, REGIONS[s.expedition.region]?.tripSeconds ?? 0) ||
      s.expedition.remaining < 1 ||
      typeof s.bay !== 'boolean' ||
      typeof s.dock !== 'boolean' ||
      !integer(s.playedSeconds, 1e12) ||
      !integer(s.trips, 1e12) ||
      !integer(s.restorations, 1e12)
    )
      throw new Error('Invalid station save');
    const e = s.economy;
    if (
      !e.levels ||
      MACHINE_KEYS.some((k) => !integer(e.levels[k], 10)) ||
      !e.reserves ||
      !finite(e.credits) ||
      !finite(e.earned) ||
      e.credits > e.earned + 1e-6
    )
      throw new Error('Invalid economy');
    const g = new OrbitalGame(s.lastAt, s.seed);
    g.state = structuredClone(s);
    const cap = g.capacity;
    if (
      !Array.isArray(e.salvage) ||
      e.salvage.length !== 3 ||
      e.salvage.some((n) => !finite(n, cap + 1e-6)) ||
      e.salvage.reduce((a, b) => a + b, 0) > cap + 1e-6 ||
      [e.metal, e.electronicScrap, e.alloy, e.circuits].some((n) => !finite(n, cap + 1e-6)) ||
      !integer(e.reserves.alloy, cap) ||
      !integer(e.reserves.circuits, cap)
    )
      throw new Error('Invalid material inventory');
    if (
      !Array.isArray(s.pity) ||
      s.pity.length !== 3 ||
      s.pity.some((n, i) => !integer(n, REGIONS[i].pity - 1))
    )
      throw new Error('Invalid expeditions');
    if (
      !Array.isArray(s.finds) ||
      s.finds.length !== 12 ||
      s.finds.some((n) => !integer(n, 1e12)) ||
      !Array.isArray(s.seen) ||
      !Array.isArray(s.displayed) ||
      s.seen.length !== 12 ||
      s.displayed.length !== 12 ||
      [...s.seen, ...s.displayed].some((v) => typeof v !== 'boolean') ||
      s.finds.some((n, i) => (n > 0 || s.displayed[i]) && !s.seen[i])
    )
      throw new Error('Invalid collection');
    if (
      !Array.isArray(s.queue) ||
      s.queue.length > 3 ||
      (!s.bay && s.queue.length > 0) ||
      s.queue.some(
        (job) =>
          !job ||
          !integer(job.discovery, 11) ||
          !s.seen[job.discovery] ||
          !['sell', 'display'].includes(job.destination) ||
          !integer(job.remaining, DISCOVERIES[job.discovery].seconds) ||
          job.remaining < 1 ||
          (job.destination === 'display' && s.displayed[job.discovery]),
      )
    )
      throw new Error('Invalid restoration queue');
    const displays = s.queue
      .filter((job) => job.destination === 'display')
      .map((job) => job.discovery);
    if (new Set(displays).size !== displays.length || (s.dock && s.unlocked !== 3))
      throw new Error('Invalid expansions');
    return g;
  }
}
