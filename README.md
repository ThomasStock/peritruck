# Peripass yard demo

Version 2 of [ThomasStock/peritruck](https://github.com/ThomasStock/peritruck), the game originally served at [truck.placeholder.app](https://truck.placeholder.app/).

A small 3D logistics yard: arrive in your articulated truck, park in holding bay P02, check in at a self-service kiosk, get called off to a dock by the yard operator on the Peripass Yard app, receive a gate PIN by SMS, enter the site, and reverse into your dock.

## Play locally

Node 22.12+ (or a current supported Node release), npm, and a browser with WebGL.

```sh
npm ci
npm run dev
```

Open the exact localhost address printed by Vite. No accounts, remote kiosk services, API keys, or backend required. The original game remains at `/v1/` for comparison.

| Input               | Action                                      |
| ------------------- | ------------------------------------------- |
| W / ↑               | Drive forward                               |
| S / ↓               | Brake, then reverse automatically           |
| A / D or ← / →      | Steer; with reverse assist, aim the trailer |
| Release accelerator | Slow to a stop                              |
| Space               | Brake                                       |
| Shift               | Precision speed                             |
| E                   | Contextual interaction                      |
| C                   | Follow / whole yard / overhead camera       |
| R                   | Recover to last safe stop                   |
| Escape / ?          | Pause, settings, remapping                  |

The game speaks English, Dutch, French, German, Polish and Romanian: the same six languages as the kiosk. The start screen shows them as chips above the title, and the flag button in the top bar lists them at any time. The choice covers every layer of copy (start screen, HUD, mission card, docking guide, dialogs, results, the SMS on the driver's phone and the simulation's own toasts and prompts), persists in `localStorage` (`yard-language`). The game always opens in English; the browser's own language is deliberately not consulted. Copy lives in `src/i18n.ts`; the kiosk keeps its own production translations and language page, and the yard operator's phone stays in the operator's English.

Touch steering and pedals appear on touch devices and small screens. Standard gamepads support left-stick steering, RT/LT pedals, B brake and A interaction. Controls can be remapped; arrow-key alternatives remain available. Gamepad mapping assumes the browser's standard layout and has not been tested with physical hardware.

The rig's lamps work: daytime running lights while the engine is on, brake lamps while braking or slowing against the throttle, and white reverse lamps once reverse gear is in.

Reverse assist is on by default. In reverse, the steering command asks the _trailer_ to turn; the controller counter-steers the tractor. Releasing steering stabilizes articulation. Classic steering is available in settings. Neither mode teleports the rig into a bay. There is no countdown or failure screen; pull forward to try again, or recover with R.

## Kiosk check-in

The kiosk is a replica of the Peripass kiosk app. On a desktop viewport it renders as a physical kiosk with navigation rails; on phone-sized viewports it renders as the Mobile Driver Portal with the inline top bar. Your delivery note lies next to the kiosk (desktop). On mobile it is a drawer on the right, offered only on the reference step: tap the **Delivery note** tab or swipe it in to read it, and keep it open while you type. Swipe it out, tap the tab or **Hide** to put it away. It carries the reference `PP-K4M7Q2`.

| Step       | What the driver sees                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Language   | Welcome page with English, Dutch, French, German, Polish and Romanian; copy follows it.                       |
| Method     | “How would you like to check in?” — enter a reference, or register step by step.                              |
| Visit type | Step by step only: inbound, outbound or contractor.                                                           |
| Reference  | Fixed `PP-` prefix, type the number from the paperwork, or **Scan document**. A wrong value shows “No match”. |
| Phone      | Country code and mobile number. Demo: any plausible number is accepted, no SMS is sent.                       |
| Endscreen  | Confirmation that the gate PIN arrives by SMS; **Home** returns the driver to the yard.                       |

**Scan document** opens the kiosk camera: the screen dims around a clear frame and the delivery note lies half outside it. Drag the note until the green reference box sits inside the frame; the kiosk outlines it, asks you to hold still, captures, shows the real kiosk's “We're scanning your document” page for a second and continues to the phone step with the reference filled in. Arrow keys move the note too. The states, colours and copy follow the production kiosk's Document Capture; the frame itself is the game's teaching aid.

Production strings are reused where the real kiosk has them; demo-only copy (visit types, phone note, endscreen) is written in `src/kiosk/i18n.ts`. The flow itself is a pure step machine in `src/kiosk/flow.ts`, covered by `tests/kiosk.test.ts`. The CLI `register` command still completes the kiosk in one call.

## Yard dispatch

Two seconds after leaving the kiosk the game changes hands. The camera pulls up and away from the driver, letterbox bars close in, and it drops down beside the yard operator standing by the rig at dock 05. Their phone comes up: a lock screen with a Peripass Yard push notification, "Driver waiting for call-off". Tap it and the Yard Operator App's dispatch module opens as in production: the **Call-off drivers** queue with the driver's card, the driver's details (carrier, licence plate, reference, time slot, phone) with **Select yard location** and **Call off driver**, the location sheet with search, the _Hide invalid locations_ filter and the **Occupied** / **Out of service** tags, then **Call-off completed**. Dock 05 holds a trailer being unloaded, dock 04 is out of service; pick one of docks 01–03. Choosing an invalid dock shows the app's own message ("Location is already occupied."); leaving it empty shows "Required".

The chosen dock is real: its number panel lights up teal and its lamp turns green, the guide dots, the docking guide and the gate SMS ("Then proceed to dock 02.") all follow it, and delivery completes at that door. After **Call off another driver** the queue is empty ("You're all done!"), the phone goes away and the camera flies back to the driver; the gate PIN SMS lands two seconds later as a lock-screen banner over the yard (tap it to dismiss). At the gate the same message is open on a rendered handset beside the terminal keypad. Both come from `src/sms.ts`.

On desktop the phone is a handset beside the 3D view; on phone-sized viewports the app fills the screen. The screens are laid out at a phone's 390 logical pixels and zoomed. The flow is a pure step machine in `src/dispatch/flow.ts`, covered by `tests/dispatch.test.ts`; the simulation holds a `dispatch` phase in which the driver waits, and the CLI `dispatch --dock N` command performs the same call-off. Hold X during the operator's turn to skip it.

## Time trial and leaderboard

Finish the delivery as fast as possible. The race starts on the truck’s first actual movement, with four timed sections: parking in P02 and stepping out, completing kiosk check-in, opening the gate (including the yard operator's call-off), and parking at your dock. Each section includes travel from the preceding milestone.

The browser uses real elapsed time, including kiosk/PIN entry, the leaderboard, and hidden-tab time; the controls dialog is the one modal that holds the clock, so reading the key bindings costs nothing. Recovery preserves the clock and splits. The existing hold-X playtest shortcut marks the run as practice; skipped runs cannot enter the leaderboard. The final docking hold stops the clock. The results screen shows total time, stage durations, contacts, recoveries and steering mode; enter a driver name to save the run, or immediately race again. Each stage row carries your rank for that section (shown once another run is on the board) and expands to that section's fastest five times, so a slow stage stands out without cluttering the summary. Section boards are derived client-side from the fastest 100 runs by total time, with an unsaved run seated provisionally.

The leaderboard is backed by [Convex](https://convex.dev) when `VITE_CONVEX_URL` is set: `convex/schema.ts` defines the `results` table, `convex/leaderboard.ts` exposes the `top` query and `save` mutation (server-side validation, one row per run, rank computed on save), and `src/leaderboard-convex.ts` subscribes so every open client updates live. Without that variable (tests, offline dev) `src/game/leaderboard.ts` falls back to the fastest 100 runs in this browser’s local storage (`peritruck-leaderboard-v1`). Run `npm run convex` (`npx convex dev`) alongside `npm run dev` to push functions and write `.env.local`. Vercel builds with `npm run build:vercel` (`convex deploy --cmd 'npm run build'`), which needs `CONVEX_DEPLOY_KEY` in the project environment. CLI runs use deterministic simulation steps for race timing, including explicit waits at the kiosk/gate; live CLI control suspends the browser clock while commands advance it.

## Drive from the CLI

The CLI runs the **same simulation and state transitions as the browser**, with a fixed 1/60-second timestep. It is suitable for agent play, reproducible bug reports and integration tests.

```sh
npm run truck -- help
npm run truck -- reset
npm run truck -- input --throttle 1 --steer 0 --seconds 2
npm run truck -- input --brake --seconds 1
npm run truck -- status
npm run truck -- drive-to --x -24 --z 39
npm run truck -- interact
npm run truck -- walk-to --x -28 --z 29
npm run truck -- walk-to --x -33.7 --z 28.2
npm run truck -- interact
npm run truck -- register --booking PP-K4M7Q2
npm run truck -- input --seconds 3
npm run truck -- dispatch --dock 3
```

`drive-to` is a feedback controller using ordinary pedals and steering. It does not plan around obstacles: provide clear intermediate waypoints. Forward targets track the fifth-wheel position; `--reverse` targets track the trailer rear. A route blocked by an obstacle exits with an error. `walk-to` uses the same walking and collision code as human play. Two seconds after `register` the session enters the `dispatch` phase and waits for the yard operator; `status` lists the docks and their availability, and `dispatch --dock N` calls the driver off to a free one before walking continues.

### Complete an automated delivery

```sh
npm run truck -- demo --session acceptance
```

The demo resets the named session, parks, walks, registers, waits for the yard operator and is called off to dock 03, enters the PIN, loops through the apron and reverses into the dock. It succeeds only if normal docking conditions are met. No teleports, phase overrides, disabled collisions, or recovery calls. The committed acceptance test completes with 0 contacts, 0 recoveries and approximately 0.15° trailer alignment error.

Headless sessions persist independently under `.yard-sessions/NAME.json`. Use `--session NAME` to isolate scenarios. Commands emit JSON and exit nonzero on failure. `npx tsx scripts/truck.ts ...` omits npm's script banner when a consumer needs JSON-only output.

### Control the visible browser

Start `npm run dev` and open the game first. Add `--live`:

```sh
npm run truck -- status --live
npm run truck -- input --throttle 1 --seconds 2 --live
npm run truck -- demo --live
npm run truck -- screenshot --live --out artifacts/yard.png
npm run truck -- resume --live
```

Live commands advance fixed simulation time and pause ordinary driving; **Resume driving** in the game (or CLI `resume`) hands control back. `status` only observes. `screenshot` captures the 3D canvas, not the HTML HUD. `--url` selects a different local Vite URL. The most recently loaded game tab receives commands.

The dev-only bridge accepts loopback requests with the CLI header and rejects browser-origin requests. It exposes an allow-listed game command dispatcher, never JavaScript evaluation or shell execution. The bridge is absent from production builds.

Supported browsers also discover `yard_status` and `yard_control` through WebMCP. The tools call the same command dispatcher. Registration was observed in the in-app browser; execution verification was blocked by the browser's automatic approval usage limit. CLI-driven parking in the live browser was verified before that block. The full demo is verified headlessly.

## Develop

```sh
npm test             # Simulation, journey, race timing and leaderboard tests
npm run build        # TypeScript check + Vite production build
npm run preview      # Serve production output locally
npm run format:check
npm run models       # Rebuild original GLB assets with installed Blender
npm run share-card   # Rebuild the link preview card from a running dev server
```

| Module                         | Owns                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `src/game/simulation.ts`       | Articulated kinematics, oriented collision, progression, proximity, parking/docking, measurements |
| `src/game/commands.ts`         | Validated CLI/WebMCP commands and feedback driver                                                 |
| `src/scene.ts`                 | Three.js rendering, camera, lights, models, merged parked rigs                                    |
| `src/route.ts`                 | Guide dots per phase as one reusable instanced mesh                                               |
| `src/prediction.ts`            | Projected tyre track, recomputed only when pose or controls change                                |
| `src/rig.ts`                   | Driver rig: displacement-driven gait, turning, idle motion                                        |
| `src/main.ts`                  | Input adapters, accessible overlays, HUD, sound and agent tool registration                       |
| `src/i18n.ts`                  | Game copy in six languages; the current language for UI, SMS and simulation text                  |
| `src/kiosk/`                   | Kiosk replica: step flow, six-language copy, DOM view and stylesheet                              |
| `src/dispatch/`                | Yard operator's phone: call-off flow, Yard Operator App replica, icons and stylesheet             |
| `src/sms.ts`                   | The driver's phone: SMS banner and handset with the Messages thread                               |
| `vite.config.ts`               | Local-only CLI/browser bridge                                                                     |
| `scripts/truck.ts`             | JSON command-line client and session persistence                                                  |
| `scripts/build_models.py`      | Reproducible Blender asset authoring                                                              |
| `scripts/build-share-card.mjs` | Link preview card, composed over a screenshot of the running yard                                 |

The renderer does not own physics. `State` is plain serializable data; `step` is the sole timed simulation transition. Explicit actions handle kiosk, call-off and PIN interaction. `predict` runs the same truck integrator for the visible path guide. The camera cut between the driver and the yard operator is presentation in `src/scene.ts`; the simulation only knows the `dispatch` phase.

Collision uses oriented rectangles for both tractor and trailer. A closed gate and its side fences are real obstacles. Docking checks the trailer's rear against the assigned dock, lateral error (<1.2 m), heading (<9°), bumper gap (−0.45…1.5 m), speed under 0.3 m/s and a 0.5 s hold; the window lives in `DOCK_TOLERANCE`. All measurements are in metres, seconds and radians; heading zero is +Z.

## Assets and design research

All 3D assets were authored in Blender from `scripts/build_models.py`, validated with Blender 5.2.1 LTS, and exported as GLB. A generated cab-over tractor, 12.8 m trailer, driver and yard require about 3.4 MB uncompressed. Assets include bevelled bodywork, mirrors, grille, multi-axle wheels, trailer rails, docking equipment, solar roof panels, fencing, kiosk, footpath, trees and lighting columns. Every wheel hangs from a named empty and rolls with the ground it covers, inside wheels slower through a turn; the front pair also steers. The driver's legs, arms, head and torso hang from named empties so the renderer can pose them. Distant scenery is joined by material to keep draw calls down.

The Peripass logo is the official first-party SVG. The house-style starting point is Montserrat and Peripass teal `#00A990`; the game adds dark green and lime feedback accents. The kiosk uses Open Sans and the kiosk app's tokens (page background `#F4F6F9`, primary teal, 56 px controls). Fonts are bundled locally. See [the cited research](docs/research.md) for the real yard process, control rationale, source links and which dimensions are deliberately simplified for play. This is a game, not a truck-driving simulator or an operational safety tool.

## Link preview

Shared links (WhatsApp, Slack, LinkedIn, X) show `public/og/share.jpg`: the yard as the game itself draws it on the start screen, with the start screen's own copy over it and the invitation "Think you can dock faster?". `index.html` carries the matching `og:*` tags and `twitter:card=summary_large_image`; `og:url` and `og:image` are absolute, as the crawlers require. The plain `description` stays the product one — only the share card teases.

The card is generated, not drawn by hand. With `npm run dev` running:

```sh
npm run share-card                  # writes public/og/share.jpg (2400x1260, ~170 kB)
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs npm run share-card
```

The script asks the game for a canvas screenshot over the same `/__yard/control` bridge the CLI uses, so the card follows the yard: change the models, the lighting or the start screen copy, rerun it and commit the new JPEG. Playwright is not a project dependency; point `PLAYWRIGHT_MODULE` at an install outside the project, as `scripts/profile-frames.mjs` does. Crawlers cache aggressively — after deploying, refresh the preview in each network's own debugger.

## Shipping

`npm run build` produces static `dist/`, suitable for the existing Vercel setup. A separate private Sites preview is configured in `.openai/hosting.json`. The original production domain is not changed by this branch. To replace v1, review and merge the v2 branch through your normal deployment workflow.
