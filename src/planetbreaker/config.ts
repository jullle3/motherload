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
  integrity: 80_000_000,
  seed: 73491,
  ocean: '#123f58',
  land: '#536f55',
};
export const OFFLINE_CAP = 8 * 3600;
export const SAVE_KEY = 'planetbreaker.save.v1';
export const SETTINGS_KEY = 'planetbreaker.settings.v1';
export const STAGES = [
  'PRISTINE WORLD',
  'SURFACE SCARRING',
  'CRUST FRACTURE',
  'CORE EXPOSURE',
  'PLANET DESTROYED',
];
export function stage(damage: number) {
  return damage >= 1 ? 4 : damage >= 0.65 ? 3 : damage >= 0.3 ? 2 : damage >= 0.025 ? 1 : 0;
}
