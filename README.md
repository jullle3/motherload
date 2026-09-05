# Motherload game collection

A desktop-first browser game collection built with TypeScript and Vite. Deepfield uses Three.js; Neon Split uses Canvas 2D. All artwork and sound effects are generated in code. Fonts are bundled locally; neither game needs external services.

## Run

```sh
npm install
npm run dev
```

Requires Node.js 22.18 or newer. Open the local URL printed by Vite. `npm run build` produces the static site in `dist`; `npm run preview` serves it. `npm test` runs simulation tests.

## Play Deepfield

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

## Play Neon Split

Open `/games/neon-split/` or choose Neon Split on the homepage. Clear 15 authored stages in solo or shared-keyboard co-op. Move along the floor, fire upward, and split bubbles until none remain. No jumping and no time-limit failure.

- Solo: A/D or Left/Right to move, Space or Enter to fire. Co-op: P1 uses A/D + Space; P2 uses Left/Right + Enter. Hold fire to repeat.
- Each stage starts with three shared lives. An unshielded hit resets the stage for everyone. Retries are unlimited; scores and timers reset on each attempt.
- Pick up double harpoons (10 seconds), slow bubbles (6 seconds), or a one-hit shield. Timed pickups refresh instead of stacking. Drops are authored, last eight seconds, and use the same pattern on retries.
- F toggles fullscreen. Escape pauses and resumes. Leaving the tab freezes this game and requires an explicit resume with a countdown. Sound is in the header; reduced effects and motion are in the pause menu.
- Stage unlocks, best scores, and best times save separately for solo and co-op under `neon-split.save.v1`. Active attempts are not saved. Storage failure permits session-only progress. Deepfield saves are independent.

## Architecture

The homepage is a lightweight game collection. Deepfield lives at `/games/deepfield/` and Neon Split at `/games/neon-split/`, each with an All Games link back home. All pages are built into `dist` for Cloudflare Pages; existing saves remain available on the same domain. Add a new game's HTML entry to `vite.config.ts`, its listing and artwork identifier to `src/catalog.ts`, and its artwork to the launcher. Cloudflare continues to use `npm run build` and `dist`.

- `src/game.ts`: deterministic seeded terrain, fixed-step simulation, economy, rescue, and versioned save validation. Tuning values and upgrade definitions live here.
- `src/render.ts`: instanced Three.js terrain, procedural rig and outpost, orthographic camera, and particles.
- `src/main.ts`: keyboard input, HUD and dialogs, autosave, and application lifecycle.
- `src/audio.ts`: synthesized effects and engine audio.
- `src/neon/`: independent fixed-step bubble simulation, authored stage data, Canvas renderer, synthesized audio, menus, and progress storage. Collision checks use swept tests and 240 Hz physics slices within the 60 Hz simulation; rendering resolution and particles are capped.

Deepfield's campaign targets 20–30 minutes; actual duration depends on route planning and requires player balancing feedback. Mobile controls, online multiplayer, and backend synchronization are outside this release. Neon Split supports local co-op.

## Validation

- `npm test`: simulation checks including 100 generated worlds, ore discovery and legacy save compatibility, harmless falls, heat damage, and three complete campaigns that earn every credit, buy upgrades, and save/reload between trips.
- `npm run test:browser -- --project=chrome --project=edge`: browser checks covering mining, trading, returning from the relic site, persistence, cancellation, keyboard focus, storage failure, heavily excavated terrain, and background simulation without animation frames.
- Chrome and Edge averaged approximately 16.6 ms per animation frame on this machine in the excavated-world check. This is a local observation, not a guarantee for all integrated GPUs.
- Firefox tests are configured (`npm run test:browser -- --project=firefox`), but the downloaded Firefox executable could not launch on this Windows host (`spawn UNKNOWN`), including outside the sandbox. Firefox compatibility remains unverified.
- `npm run build`: TypeScript validation and optimized production bundle. Fonts, game assets, and synthesized audio require no third-party network requests.
- Neon Split unit checks cover collisions, splitting, power-ups, retries, pause, scoring, and save validation. A test-only lookahead player clears all 15 stages in each mode through ordinary controls and reloads progress after every clear. These automated runs validate completion, not a human difficulty rating.
- Neon Split browser checks cover collection navigation, solo/co-op selection, gameplay, stage unlocks, blur pausing, fullscreen, keyboard focus, storage failure, and production routes.
- Neon Split caches static arena art and bubble glow sprites. In local production co-op samples at 1440×900, Edge averaged 16.7 ms per animation frame and Chrome averaged 33.3 ms, including with lower effects. A consistent 60 fps in Chrome is not yet verified. These are host-specific measurements, not a cross-device performance guarantee.
