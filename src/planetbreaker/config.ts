export type WeaponKey = 'laser' | 'missile' | 'plasma' | 'siege';
export const KEYS: WeaponKey[] = ['laser', 'missile', 'plasma', 'siege'];
export const WEAPONS = {
  laser: {
    name: 'Mining laser',
    tag: 'PRECISION EXTRACTION',
    description: 'Continuous orbital cuts. Every scar pays.',
    cost: 35,
    damage: 2,
    period: 2,
    unlock: 0,
    color: '#79eed6',
  },
  missile: {
    name: 'Missile platform',
    tag: 'KINETIC BOMBARDMENT',
    description: 'Guided salvos. Beautifully inevitable.',
    cost: 550,
    damage: 24,
    period: 4,
    unlock: 300,
    color: '#ffb66e',
  },
  plasma: {
    name: 'Plasma lance',
    tag: 'THERMAL EXCAVATION',
    description: 'Superheated matter meets fragile geology.',
    cost: 6200,
    damage: 180,
    period: 5,
    unlock: 4200,
    color: '#a6a1ff',
  },
  siege: {
    name: 'Siege cannon',
    tag: 'PLANETARY FRACTURE',
    description: 'For problems the size of a planet.',
    cost: 65000,
    damage: 1500,
    period: 8,
    unlock: 45000,
    color: '#ff7285',
  },
} as const;
export const PLANET = {
  id: 'aurelia',
  name: 'Aurelia',
  designation: 'KEPLER SECTOR / 004',
  integrity: 4_080_000,
  seed: 73491,
  ocean: '#123f58',
  land: '#536f55',
};
export const OFFLINE_CAP = 8 * 3600;
export const SAVE_KEY = 'planetbreaker.save.v1';
export const SETTINGS_KEY = 'planetbreaker.settings.v1';
export const LAYERS = [
  { name: 'SURFACE', hp: 80_000, weight: 0.3 },
  { name: 'MANTLE', hp: 800_000, weight: 0.35 },
  { name: 'CORE', hp: 3_200_000, weight: 0.35 },
] as const;
export function layerProgress(damage: number) {
  let remaining = Math.max(0, damage),
    fraction = 0;
  for (const layer of LAYERS) {
    if (remaining < layer.hp)
      return {
        ...layer,
        remaining: layer.hp - remaining,
        fraction: fraction + (remaining / layer.hp) * layer.weight,
      };
    remaining -= layer.hp;
    fraction += layer.weight;
  }
  return { ...LAYERS[2], remaining: 0, fraction: 1 };
}
export type BoostKey = 'overdrive' | 'surge' | 'autofire';
export const BOOST_KEYS: BoostKey[] = ['overdrive', 'surge', 'autofire'];
export const BOOSTS = {
  overdrive: {
    name: 'Overdrive',
    color: '#7cf8de',
    benefit: '2× fleet fire rate · 4× fleet income',
    icon: 'ϟ',
  },
  surge: {
    name: 'Credit Surge',
    color: '#ffda87',
    benefit: '3× credits from every attack',
    icon: '◈',
  },
  autofire: {
    name: 'Auto-Fire',
    color: '#c0a2ff',
    benefit: '5 bonus lasers/sec · 2× manual shot power',
    icon: '⌖',
  },
} as const;
export const STAGES = [
  'PRISTINE WORLD',
  'SURFACE SCARRING',
  'CRUST FRACTURE',
  'CORE EXPOSURE',
  'PLANET DESTROYED',
];
export function stage(damage: number) {
  return damage >= 1 ? 4 : damage >= 0.65 ? 3 : damage >= 0.3 ? 2 : damage >= 0.005 ? 1 : 0;
}
