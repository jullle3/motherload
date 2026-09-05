export type Size = 0 | 1 | 2 | 3;
export type Power = 'double' | 'slow' | 'shield';
export interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface BubbleSpawn {
  x: number;
  y: number;
  size: Size;
  direction: -1 | 1;
}
export interface Stage {
  name: string;
  theme: number;
  bubbles: BubbleSpawn[];
  coop: BubbleSpawn[];
  platforms: Platform[];
  drops: { after: number; power: Power }[];
}
const bubble = (x: number, y: number, size: Size, direction: -1 | 1 = 1): BubbleSpawn => ({
  x,
  y,
  size,
  direction,
});
const platform = (x: number, y: number, w: number): Platform => ({ x, y, w, h: 14 });
const layouts: { name: string; bubbles: BubbleSpawn[]; platforms?: Platform[] }[] = [
  { name: 'First contact', bubbles: [bubble(180, 200, 2)] },
  { name: 'Two to tango', bubbles: [bubble(160, 180, 2), bubble(800, 180, 2, -1)] },
  {
    name: 'Little trouble',
    bubbles: [
      bubble(160, 240, 1),
      bubble(350, 170, 1),
      bubble(630, 220, 1, -1),
      bubble(800, 150, 1, -1),
    ],
  },
  { name: 'Big impression', bubbles: [bubble(200, 160, 3), bubble(770, 230, 1, -1)] },
  {
    name: 'Crossfire',
    bubbles: [bubble(140, 150, 3), bubble(800, 180, 2, -1), bubble(670, 290, 1)],
  },
  {
    name: 'Underpass',
    bubbles: [bubble(170, 140, 2), bubble(760, 340, 2, -1)],
    platforms: [platform(380, 220, 200)],
  },
  {
    name: 'Twin bridges',
    bubbles: [bubble(120, 160, 2), bubble(480, 130, 2, -1), bubble(840, 330, 1)],
    platforms: [platform(190, 240, 150), platform(620, 240, 150)],
  },
  {
    name: 'High wire',
    bubbles: [bubble(130, 140, 3), bubble(810, 170, 2, -1)],
    platforms: [platform(360, 180, 240)],
  },
  {
    name: 'Offset',
    bubbles: [bubble(160, 330, 2), bubble(480, 130, 2), bubble(820, 330, 2, -1)],
    platforms: [platform(120, 210, 170), platform(650, 260, 170)],
  },
  {
    name: 'Over and under',
    bubbles: [bubble(120, 160, 3), bubble(800, 170, 3, -1)],
    platforms: [platform(350, 240, 260)],
  },
  {
    name: 'Afterglow',
    bubbles: [bubble(130, 160, 3), bubble(790, 320, 2, -1), bubble(600, 150, 1)],
    platforms: [platform(290, 210, 140), platform(620, 250, 140)],
  },
  {
    name: 'Ricochet',
    bubbles: [bubble(120, 160, 2), bubble(470, 150, 3), bubble(820, 340, 2, -1)],
    platforms: [platform(210, 270, 160), platform(620, 200, 160)],
  },
  {
    name: 'Split decision',
    bubbles: [bubble(110, 140, 3), bubble(820, 180, 3, -1), bubble(490, 340, 1)],
    platforms: [platform(330, 190, 300)],
  },
  {
    name: 'Critical mass',
    bubbles: [bubble(110, 150, 3), bubble(480, 130, 2), bubble(830, 330, 3, -1)],
    platforms: [platform(180, 240, 150), platform(610, 220, 150)],
  },
  {
    name: 'One last pop',
    bubbles: [
      bubble(110, 150, 3),
      bubble(850, 150, 3, -1),
      bubble(480, 330, 2),
      bubble(690, 350, 1, -1),
    ],
    platforms: [platform(240, 220, 160), platform(560, 220, 160)],
  },
];
export const STAGES: Stage[] = layouts.map((layout, i) => ({
  ...layout,
  theme: Math.floor(i / 5),
  platforms: layout.platforms ?? [],
  coop: [bubble(480, 90, i < 5 ? 1 : 2, i % 2 ? -1 : 1)],
  drops:
    i === 0
      ? [{ after: 2, power: 'slow' }]
      : [
          { after: 2, power: i % 2 ? 'shield' : 'double' },
          { after: 6, power: 'slow' },
          { after: 12, power: i % 2 ? 'double' : 'shield' },
        ],
}));
