# DEEPFIELD

A desktop-first browser mining game built with TypeScript, Three.js, and Vite. All world geometry and sound effects are generated in code. Fonts are bundled locally; the game needs no external services.

## Run

```sh
npm install
npm run dev
```

Requires Node.js 22.18 or newer. Open the local URL printed by Vite. `npm run build` produces the static site in `dist`; `npm run preview` serves it. `npm test` runs simulation tests.

## Play

- WASD or arrows: move and drill left/right/down; up thrusts through existing tunnels.
- E: open the workshop while landed at the surface. Sell cargo, refuel and repair for free, and buy upgrades.
- Escape: pause or resume. Losing window focus also pauses.
- Upgrade the drill to tier 4 to open the relic casing at 1,530 m, then return it to the surface. Rescue loses cargo, but keeps credits, upgrades, and tunnels.
- The station foundation is protected so rescues always have a safe landing point. Start digging to its right.

Progress saves locally every eight seconds and at important events. New Expedition replaces the save after confirmation. Browser storage clearing removes progress. Settings for sound, reduced shake, and effects are available in the interface.

## Architecture

- `src/game.ts`: deterministic seeded terrain, fixed-step simulation, economy, rescue, and versioned save validation. Tuning values and upgrade definitions live here.
- `src/render.ts`: instanced Three.js terrain, procedural rig and outpost, orthographic camera, and particles.
- `src/main.ts`: keyboard input, HUD and dialogs, autosave, and application lifecycle.
- `src/audio.ts`: synthesized effects and engine audio.

The initial campaign targets 20–30 minutes; actual duration depends on route planning and requires player balancing feedback. Mobile controls, combat, multiplayer, and backend synchronization are outside this release.

## Validation

- `npm test`: 12 passing checks, including 100 generated worlds and three complete campaigns that earn every credit, buy upgrades, and save/reload between trips. The conservative automated pilot finished in 22.7, 23.5, and 26.1 simulated minutes.
- `npm run test:browser -- --project=chrome --project=edge`: 10 passing browser checks covering mining, trading, returning from the relic site, persistence, cancellation, keyboard focus, storage failure, and heavily excavated terrain.
- Chrome and Edge averaged approximately 16.6 ms per animation frame on this machine in the excavated-world check. This is a local observation, not a guarantee for all integrated GPUs.
- Firefox tests are configured (`npm run test:browser -- --project=firefox`), but the downloaded Firefox executable could not launch on this Windows host (`spawn UNKNOWN`), including outside the sandbox. Firefox compatibility remains unverified.
- `npm run build`: TypeScript validation and optimized production bundle. Fonts, game assets, and synthesized audio require no third-party network requests.
