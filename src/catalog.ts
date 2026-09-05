// Add a catalog entry and a matching HTML entry in vite.config.ts for each new game.
export const games = [
  {
    title: 'Orbital Scrapyard',
    artwork: 'orbital-scrapyard',
    href: '/games/orbital-scrapyard/',
    genre: 'IDLE / SALVAGE TYCOON',
    description:
      'One little drone. An endless sky of possibilities. Build a cozy orbital factory, restore forgotten treasures, and grow while you’re away.',
    controls: 'Mouse + touch',
    session: 'Persistent idle world',
  },
  {
    title: 'Deepfield',
    artwork: 'deepfield',
    href: '/games/deepfield/',
    genre: 'EXPLORATION / MINING',
    description:
      'One rig. An alien world. A fortune beneath your feet. Dig deep, upgrade your gear, and make it back in one piece.',
    controls: 'Keyboard + mouse',
    session: '20–30 min adventure',
  },
  {
    title: 'Neon Split',
    artwork: 'neon-split',
    href: '/games/neon-split/',
    genre: 'ARCADE / BUBBLE DODGING',
    description:
      'Dodge, split, repeat. Burst your way through 15 neon arenas. Play solo or share the chaos with a friend on one keyboard.',
    controls: 'Solo + local co-op',
    session: '15 arcade stages',
  },
];
