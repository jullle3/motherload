# Motherload game collection

A browser game collection built with TypeScript and Vite. Deepfield, Orbital Scrapyard, and Planetbreaker use Three.js; Neon Split uses Canvas 2D. All artwork and sound effects are generated in code. Fonts are bundled locally; all four games work without external services. Orbital and Planetbreaker support desktop and phone; the other games are desktop-first.

## Run

```sh
npm install
npm run dev
```

Requires Node.js 22.18 or newer. Open the local URL printed by Vite. `npm run build` produces the static site in `dist`; `npm run preview` serves it. `npm test` runs simulation tests.

## Play Planetbreaker

Open `/games/planetbreaker/` or select Planetbreaker on the homepage. Build an orbital arsenal and watch the Earthlike planet Aurelia gradually become stardust.

- One mining laser starts automatically. Buy additional mining lasers, missile platforms, plasma lances, and siege cannons. Three upgrades per class double damage and income; the shop previews prices and output and highlights the best affordable output per credit.
- Click or tap the planet to fire at a location, or use the keyboard-accessible Fire button. Manual fire is optional and limited to five shots per second.
- Impacts earn credits and permanently mark the surface. Increasing damage creates molten fractures, removes crust, exposes the core, and ends in an expanding shockwave and debris field. Replay starts a fresh first level after confirmation; there is no prestige or second planet yet.
- Aurelia has 80,000 surface HP, 800,000 mantle HP, and 3.2 million core HP. These layers represent 30%, 35%, and 35% of overall integrity. Early surface damage produces visible progress; the HUD shows the current layer's health.
- Collect supply drones by clicking/tapping them or using the collection button. The first arrives after 45 seconds, flies for 14 seconds, and offers a 30-second bonus. Overdrive gives twice the automatic firing rate and twice the credits per automatic hit (4× automatic income); Credit Surge triples all attack credits; Auto-Fire adds five double-strength manual-style shots per second. Types rotate through a shuffled bag. The next fly-by arrives 75–105 seconds after a missed reward or the previous boost ends.
- Rewards and remaining boost durations pause while hidden or closed; offline earnings use the unboosted fleet rate. Reloading cannot reroll rewards or stack boosts. Automatic bonus shots do not count as player clicks.
- Satellite trajectories start at the selected emitter and stop at their first solid contact. Curved rockets, manual fire, and Auto-Fire use the same collision rules and shared crust field. Planet, cloud, and satellite motion is smoothed between simulation ticks without changing earnings.
- Up to eight hours of offline income is credited on return. Hidden tabs also earn credits without damaging Aurelia, so you can watch the destruction. Offline credits can shorten later active play.
- Progress autosaves every five seconds, on purchases/reward collection, and when leaving. Saves use `planetbreaker.save.v1` independently of other games, with a version-2 payload. Existing version-1 fleets, balances, damage, and scars migrate without resetting; runs past the new health total finish once. Web Locks allow one active save owner; unavailable storage or Web Locks produces a session-only notice. Invalid saves remain untouched until an explicit reset.
- Settings include sound, effects volume, reduced motion and flashes, and lower effects. Weapons have distinct filtered sound layers, restrained mixing, and reward chimes. Reduced motion uses stationary collectibles. F or the header button toggles fullscreen where supported. No accounts or external assets are needed.

Simulated mixed purchases once a minute complete Aurelia in approximately **49 minutes**, **42.5 minutes** with occasional rewards, or **40.5 minutes** with regular manual shots. Efficient purchasing takes approximately 32 minutes; buying structures without upgrades takes approximately 79 minutes. These are balance simulations, not measured human play sessions. Configured planet, layers, weapon and boost definitions live in `src/planetbreaker/config.ts`; simulation, targeting, storage, audio, rendering, and interface are separate modules.

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

## Play Orbital Scrapyard

Open `/games/orbital-scrapyard/` or choose its homepage card. Your drone, sorter, furnace, and sales terminal start working automatically. Select machines in the isometric station or use the buttons below it; phone layouts provide touch controls and a contextual bottom panel.

- Upgrade five machine categories through ten levels. The bottleneck panel recommends the machine limiting production. Until the electronics recycler is installed, electronic scrap sells directly to keep the starting factory moving.
- Finished materials sell automatically above adjustable reserves. Set reserves at the sales terminal to fund restoration and expansion; expansion cards can prepare them for you once storage is large enough. Lowering reserves resumes sales if storage fills.
- Unlock the Satellite Belt, Derelict Trade Route, and Alien Graveyard in order. Expeditions repeat automatically and region changes apply to the next trip. Twelve discovery types have saved random outcomes and a rare-find guarantee.
- Dismantle finds for materials, restore them for sale, or exhibit them for a permanent bonus. Restoration costs are paid when queued; one bay processes up to three queued jobs in order. A unique exhibit grants its bonus once, while duplicate finds remain useful.
- Construct the ship-breaking dock to complete the initial progression. Keep producing, upgrading, and collecting afterward; there is no reset or upkeep.
- Production and restoration catch up automatically for up to 24 hours away. Background tabs stop rendering, and menus leave the economy running. The return summary reports progress already credited.
- Settings include sound, reduced motion, and lower effects. Use the header button or F for fullscreen where supported. No keyboard controls are required.
- Progress saves independently under `orbital-scrapyard.save.v1`. Export JSON backups from the footer/settings. Imports are validated and previewed before replacement and receive no extra offline income. Keep backups: clearing browser storage removes local progress.
- Web Locks permit one active tab per save. Close that tab and reconnect in another to switch. Unavailable storage displays a persistent session-only notice; export still works. Invalid original saves are preserved until explicit replacement.

Simulated purchases with visits every two, four, and eight hours reach the dock in approximately 50.5, 56.5, and 64.5 hours respectively. With two-hour visits, region unlocks occur around 4.5 and 18.5 hours. Daily-only visits take about six days because upgrades happen less often. These are automated balance estimates, not measured human play sessions.

## Architecture

The homepage is a lightweight game collection. Deepfield lives at `/games/deepfield/` and Neon Split at `/games/neon-split/`, each with an All Games link back home. All pages are built into `dist` for Cloudflare Pages; existing saves remain available on the same domain. Add a new game's HTML entry to `vite.config.ts`, its listing and artwork identifier to `src/catalog.ts`, and its artwork to the launcher. Cloudflare continues to use `npm run build` and `dist`.

- `src/game.ts`: deterministic seeded terrain, fixed-step simulation, economy, rescue, and versioned save validation. Tuning values and upgrade definitions live here.
- `src/render.ts`: instanced Three.js terrain, procedural rig and outpost, orthographic camera, and particles.
- `src/main.ts`: keyboard input, HUD and dialogs, autosave, and application lifecycle.
- `src/audio.ts`: synthesized effects and engine audio.
- `src/neon/`: independent fixed-step bubble simulation, authored stage data, Canvas renderer, synthesized audio, menus, and progress storage. Collision checks use swept tests and 240 Hz physics slices within the 60 Hz simulation; rendering resolution and particles are capped.
- `src/orbital/`: configuration for recipes, rates, costs, regions, and discoveries; deterministic one-second economy; isolated persistence; procedural Three.js station; responsive menus and synthesized audio. Catch-up uses the same bounded simulation as active play. The homepage and each of the three games have separate Vite entries, so game code loads only on its own page.

Deepfield's campaign targets 20–30 minutes; actual duration depends on route planning and requires player balancing feedback. Mobile gameplay controls for Deepfield and Neon Split, online multiplayer, and backend synchronization are outside this release. Neon Split supports local co-op; Orbital supports touch.

## Validation

- `npm test`: simulation checks including 100 generated worlds, ore discovery and legacy save compatibility, harmless falls, heat damage, and three complete campaigns that earn every credit, buy upgrades, and save/reload between trips.
- `npm run test:browser -- --project=chrome --project=edge`: browser checks covering mining, trading, returning from the relic site, persistence, cancellation, keyboard focus, storage failure, heavily excavated terrain, and background simulation without animation frames.
- Chrome and Edge averaged approximately 16.6 ms per animation frame on this machine in the excavated-world check. This is a local observation, not a guarantee for all integrated GPUs.
- Firefox tests are configured (`npm run test:browser -- --project=firefox`), but the downloaded Firefox executable could not launch on this Windows host (`spawn UNKNOWN`), including outside the sandbox. Firefox compatibility remains unverified.
- `npm run build`: TypeScript validation and optimized production bundle. Fonts, game assets, and synthesized audio require no third-party network requests.
- Neon Split unit checks cover collisions, splitting, power-ups, retries, pause, scoring, and save validation. A test-only lookahead player clears all 15 stages in each mode through ordinary controls and reloads progress after every clear. These automated runs validate completion, not a human difficulty rating.
- Neon Split browser checks cover collection navigation, solo/co-op selection, gameplay, stage unlocks, blur pausing, fullscreen, keyboard focus, storage failure, and production routes.
- Neon Split caches static arena art and bubble glow sprites. In local production co-op samples at 1440×900, Edge averaged 16.7 ms per animation frame and Chrome averaged 33.3 ms, including with lower effects. A consistent 60 fps in Chrome is not yet verified. These are host-specific measurements, not a cross-device performance guarantee.
- Orbital has 15 simulation/progression tests covering conservation, capacities, reserves, restoration, unique bonuses, seeded expeditions, clock changes, fractional updates, the offline cap, validation, and purchases over multiple days. The whole collection has 52 simulation tests.
- `npx playwright test tests/browser/orbital.spec.ts --project=chrome --project=edge`: 12 passing checks, including touch, fullscreen, imports, storage failure, two-tab ownership, offline restoration, and phone layouts. The expanded station averaged 16.8 ms/frame in Chrome and 16.7 ms/frame in Edge locally.
- `node --import tsx tests/orbital-production.ts` checks production routes and rendering in Chrome/Edge with a preview server on port 4175. A fully expanded 24-hour catch-up measured 55 ms locally. Performance varies by device.
- Orbital Firefox validation was attempted but launch fails with `spawn UNKNOWN`. The WebKit phone project is configured, but its browser binary was unavailable on this host. Firefox and WebKit compatibility remain unverified; phone-sized Chrome touch checks passed.
