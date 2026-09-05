# DEEPFIELD

A desktop-first browser mining game built with TypeScript, Three.js, and Vite. All world geometry and sound effects are generated in code. Fonts are bundled locally; the game needs no external services.

## Run

```sh
npm install
npm run dev
```

Requires Node.js 22.18 or newer. Open the local URL printed by Vite. `npm run build` produces the static site in `dist`; `npm run preview` serves it. `npm test` runs simulation tests.

## Play

- WASD or arrows: move and drill in all four directions; up thrusts and drills overhead rock.
- Partially drilled blocks keep their progress when you stop, switch targets, return after rescue, or reload a save.
- Install a Turbo Thruster in the workshop, then hold Up + Space for a fast upward burst through ordinary rock. The three tiers cost 300 / 1,000 / 2,600 credits and provide 0.6 / 1.2 / 2 seconds of boost. Release Space between bursts; recharge takes six seconds. Turbo uses extra fuel, collects ore along its path, and stops at full cargo or protected structures. Thermal rock remains dangerous.
- E: open the workshop while landed at the surface. Sell cargo, refuel and repair for free, and buy upgrades.
- Escape closes menus. Settings and New Expedition are available in the header.
- F or Fullscreen in the header toggles fullscreen for the entire game, including menus and HUD. The browser's Escape shortcut also exits fullscreen.
- The game keeps running when unfocused or in a background tab; movement keys clear when focus is lost. A timer advances simulation and autosaves independently of rendering, subject to browser suspension and throttling.
- Fuel, hull, credits, depth, and cargo appear directly over the game world. Ore names appear only after their first collection; discoveries remain known after selling or rescue and across reloads.
- Explore to discover what lies below. Falling causes no damage; hot rock still damages the hull. Rescue loses cargo, but keeps credits, upgrades, and tunnels.
- Ultra-rare diamonds, rubies, and void crystals can appear in every biome, with increasing chances deeper down. Larger crystals mark these valuable finds; collecting one reveals its cargo entry. Existing saves retain their common ore deposits and excavated tunnels.
- The station foundation is protected so rescues always have a safe landing point. Start digging to its right.

Progress saves locally every eight seconds and at important events. New Expedition replaces the save after confirmation. Browser storage clearing removes progress. Settings for sound, reduced shake, and effects are available in the interface.

## Architecture

- `src/game.ts`: deterministic seeded terrain, fixed-step simulation, economy, rescue, and versioned save validation. Tuning values and upgrade definitions live here.
- `src/render.ts`: instanced Three.js terrain, procedural rig and outpost, orthographic camera, and particles.
- `src/main.ts`: keyboard input, HUD and dialogs, autosave, and application lifecycle.
- `src/audio.ts`: synthesized effects and engine audio.

The initial campaign targets 20–30 minutes; actual duration depends on route planning and requires player balancing feedback. Mobile controls, combat, multiplayer, and backend synchronization are outside this release.

## Validation

- `npm test`: simulation checks including 100 generated worlds, ore discovery and legacy save compatibility, harmless falls, heat damage, and three complete campaigns that earn every credit, buy upgrades, and save/reload between trips.
- `npm run test:browser -- --project=chrome --project=edge`: browser checks covering mining, trading, returning from the relic site, persistence, cancellation, keyboard focus, storage failure, heavily excavated terrain, and background simulation without animation frames.
- Chrome and Edge averaged approximately 16.6 ms per animation frame on this machine in the excavated-world check. This is a local observation, not a guarantee for all integrated GPUs.
- Firefox tests are configured (`npm run test:browser -- --project=firefox`), but the downloaded Firefox executable could not launch on this Windows host (`spawn UNKNOWN`), including outside the sandbox. Firefox compatibility remains unverified.
- `npm run build`: TypeScript validation and optimized production bundle. Fonts, game assets, and synthesized audio require no third-party network requests.
