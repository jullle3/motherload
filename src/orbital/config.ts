export type Machine = 'drone' | 'sorter' | 'furnace' | 'electronics' | 'storage';
export type Material = 'alloy' | 'circuits';
export interface Cost {
  credits: number;
  alloy: number;
  circuits: number;
}
export interface MachineDefinition {
  name: string;
  description: string;
  baseCost: number;
  costGrowth: number;
  baseRate: number;
  rateGrowth: number;
  unit: string;
}
export const MACHINES: Record<Machine, MachineDefinition> = {
  drone: {
    name: 'Salvage drones',
    description: 'Bring scrap home from the active expedition region.',
    baseCost: 50,
    costGrowth: 2.25,
    baseRate: 1,
    rateGrowth: 1.17,
    unit: 'scrap / s',
  },
  sorter: {
    name: 'Sorting line',
    description: 'Separate incoming salvage into metal and electronic scrap.',
    baseCost: 65,
    costGrowth: 2.2,
    baseRate: 1.3,
    rateGrowth: 1.17,
    unit: 'scrap / s',
  },
  furnace: {
    name: 'Alloy furnace',
    description: 'Smelt two units of metal into one alloy.',
    baseCost: 80,
    costGrowth: 2.2,
    baseRate: 0.5,
    rateGrowth: 1.2,
    unit: 'alloy / s',
  },
  electronics: {
    name: 'Electronics recycler',
    description:
      'Turn two units of electronic scrap into one circuit. Until installed, scrap electronics sell to traders.',
    baseCost: 500,
    costGrowth: 1.95,
    baseRate: 0.18,
    rateGrowth: 1.22,
    unit: 'circuits / s',
  },
  storage: {
    name: 'Cargo buffers',
    description: 'Expand every production buffer and material reserve.',
    baseCost: 100,
    costGrowth: 2,
    baseRate: 150,
    rateGrowth: 1.45,
    unit: 'per buffer',
  },
};
export const MACHINE_KEYS = Object.keys(MACHINES) as Machine[];
export interface Region {
  name: string;
  subtitle: string;
  tripSeconds: number;
  yield: number;
  metal: number;
  milestone: number;
  cost: Cost;
  pity: number;
  color: string;
}
export const REGIONS: Region[] = [
  {
    name: 'Satellite Belt',
    subtitle: 'Familiar wrecks. A promising beginning.',
    tripSeconds: 300,
    yield: 1,
    metal: 0.8,
    milestone: 0,
    cost: { credits: 0, alloy: 0, circuits: 0 },
    pity: 12,
    color: '#e9b66d',
  },
  {
    name: 'Derelict Trade Route',
    subtitle: 'Luxury liners and forgotten freight.',
    tripSeconds: 900,
    yield: 1.35,
    metal: 0.65,
    milestone: 150000,
    cost: { credits: 50000, alloy: 250, circuits: 60 },
    pity: 10,
    color: '#8ccbb9',
  },
  {
    name: 'Alien Graveyard',
    subtitle: 'Strange materials. Older mysteries.',
    tripSeconds: 1800,
    yield: 1.8,
    metal: 0.55,
    milestone: 1000000,
    cost: { credits: 250000, alloy: 900, circuits: 200 },
    pity: 8,
    color: '#b8a2e6',
  },
];
export interface Discovery {
  name: string;
  description: string;
  region: number;
  rare: boolean;
  color: string;
  shape: 'satellite' | 'probe' | 'ship' | 'artifact';
  dismantle: { alloy: number; circuits: number };
  restore: Cost;
  seconds: number;
  sale: number;
  bonus: number;
}
export const DISCOVERIES: Discovery[] = [
  {
    name: 'Weatherwatch satellite',
    description: 'Still patiently reporting a forecast for a world long gone.',
    region: 0,
    rare: false,
    color: '#e9b66d',
    shape: 'satellite',
    dismantle: { alloy: 12, circuits: 0 },
    restore: { credits: 80, alloy: 8, circuits: 0 },
    seconds: 120,
    sale: 350,
    bonus: 0.01,
  },
  {
    name: 'Courier capsule',
    description: 'One last delivery. No forwarding address.',
    region: 0,
    rare: false,
    color: '#91c9c1',
    shape: 'probe',
    dismantle: { alloy: 18, circuits: 3 },
    restore: { credits: 120, alloy: 12, circuits: 0 },
    seconds: 180,
    sale: 600,
    bonus: 0.01,
  },
  {
    name: 'Stargazer telescope',
    description: 'Its mirrors once held a million distant suns.',
    region: 0,
    rare: true,
    color: '#aed7ee',
    shape: 'satellite',
    dismantle: { alloy: 35, circuits: 8 },
    restore: { credits: 250, alloy: 20, circuits: 4 },
    seconds: 300,
    sale: 1600,
    bonus: 0.02,
  },
  {
    name: 'Pioneer’s golden record',
    description: 'A small disc full of impossible optimism.',
    region: 0,
    rare: true,
    color: '#f5d888',
    shape: 'artifact',
    dismantle: { alloy: 60, circuits: 15 },
    restore: { credits: 500, alloy: 30, circuits: 8 },
    seconds: 600,
    sale: 4000,
    bonus: 0.03,
  },
  {
    name: 'Merchant navigation core',
    description: 'It remembers routes that no chart has kept.',
    region: 1,
    rare: false,
    color: '#96d2b6',
    shape: 'probe',
    dismantle: { alloy: 40, circuits: 12 },
    restore: { credits: 600, alloy: 30, circuits: 8 },
    seconds: 300,
    sale: 2200,
    bonus: 0.01,
  },
  {
    name: 'Passenger garden dome',
    description: 'A tiny forest sheltered inside a cracked glass shell.',
    region: 1,
    rare: false,
    color: '#a6d48b',
    shape: 'satellite',
    dismantle: { alloy: 70, circuits: 18 },
    restore: { credits: 900, alloy: 45, circuits: 12 },
    seconds: 480,
    sale: 3600,
    bonus: 0.02,
  },
  {
    name: 'Velvet comet yacht',
    description: 'Polished brass. Velvet seats. An extravagant escape.',
    region: 1,
    rare: true,
    color: '#e5b2c1',
    shape: 'ship',
    dismantle: { alloy: 140, circuits: 40 },
    restore: { credits: 2000, alloy: 90, circuits: 25 },
    seconds: 900,
    sale: 8500,
    bonus: 0.02,
  },
  {
    name: 'Royal observatory bow',
    description: 'A cathedral of windows pointed into the dark.',
    region: 1,
    rare: true,
    color: '#d8bdf2',
    shape: 'ship',
    dismantle: { alloy: 220, circuits: 70 },
    restore: { credits: 4000, alloy: 140, circuits: 40 },
    seconds: 1200,
    sale: 18000,
    bonus: 0.03,
  },
  {
    name: 'Silent surveyor',
    description: 'It measured this system before our sun had a name.',
    region: 2,
    rare: false,
    color: '#c0b0ea',
    shape: 'probe',
    dismantle: { alloy: 100, circuits: 35 },
    restore: { credits: 1800, alloy: 65, circuits: 22 },
    seconds: 600,
    sale: 6500,
    bonus: 0.02,
  },
  {
    name: 'Sealed seed vault',
    description: 'Something inside turns toward the light.',
    region: 2,
    rare: false,
    color: '#82ddd1',
    shape: 'artifact',
    dismantle: { alloy: 140, circuits: 50 },
    restore: { credits: 2600, alloy: 95, circuits: 30 },
    seconds: 900,
    sale: 9500,
    bonus: 0.02,
  },
  {
    name: 'Singing cargo prism',
    description: 'Three walls. Six shadows. A melody with no source.',
    region: 2,
    rare: true,
    color: '#c19aff',
    shape: 'artifact',
    dismantle: { alloy: 250, circuits: 100 },
    restore: { credits: 5000, alloy: 170, circuits: 60 },
    seconds: 1500,
    sale: 22000,
    bonus: 0.03,
  },
  {
    name: 'The first voyager',
    description: 'Not a weapon. Not a warning. Someone else was curious too.',
    region: 2,
    rare: true,
    color: '#f3d4a1',
    shape: 'ship',
    dismantle: { alloy: 400, circuits: 180 },
    restore: { credits: 10000, alloy: 250, circuits: 110 },
    seconds: 1800,
    sale: 50000,
    bonus: 0.04,
  },
];
export const CONFIG = {
  offlineSeconds: 86400,
  maxLevel: 10,
  alloyPrice: 5,
  circuitPrice: 14,
  scrapElectronicsPrice: 1,
  bayCost: { credits: 200, alloy: 10, circuits: 0 } as Cost,
  dockMilestone: 3500000,
  dockCost: { credits: 1800000, alloy: 2000, circuits: 500 } as Cost,
  dockBonus: 0.25,
  rareWeights: [0.55, 0.3, 0.13, 0.02],
  queueLimit: 3,
};
