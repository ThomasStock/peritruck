# Peripass yard demo

Version 2 of [ThomasStock/peritruck](https://github.com/ThomasStock/peritruck), the game originally served at [truck.placeholder.app](https://truck.placeholder.app/).

A small 3D logistics yard: arrive in your articulated truck, park in holding bay P02, check in at a self-service kiosk, receive a gate PIN by SMS, enter the site, and reverse into dock 03.

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

Touch steering and pedals appear on touch devices and small screens. Standard gamepads support left-stick steering, RT/LT pedals, B brake and A interaction. Controls can be remapped; arrow-key alternatives remain available. Gamepad mapping assumes the browser's standard layout and has not been tested with physical hardware.

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

Two seconds after leaving the kiosk the SMS lands on the driver's phone: a lock-screen banner drops over the yard (tap it to dismiss; it leaves by itself). At the gate the same message is open on a rendered handset beside the terminal keypad. Both come from `src/sms.ts`; the delay lives in the simulation as `smsAt`, so CLI sessions and the browser agree on when the PIN is known.

Production strings are reused where the real kiosk has them; demo-only copy (visit types, phone note, endscreen) is written in `src/kiosk/i18n.ts`. The flow itself is a pure step machine in `src/kiosk/flow.ts`, covered by `tests/kiosk.test.ts`. The CLI `register` command still completes the kiosk in one call.

## Time trial and leaderboard

Finish the delivery as fast as possible. The race starts on the truck’s first actual movement, with four timed sections: parking in P02 and stepping out, completing kiosk check-in, opening the gate, and parking at dock 03. Each section includes travel from the preceding milestone.

The browser uses real elapsed time, including kiosk/PIN entry, settings, and hidden-tab time. Recovery preserves the clock and splits. The existing hold-X playtest shortcut marks the run as practice; skipped runs cannot enter the leaderboard. The final docking hold stops the clock. The results screen shows total time, stage durations, contacts, recoveries and steering mode; enter a driver name to save the run, or immediately race again.

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
```

`drive-to` is a feedback controller using ordinary pedals and steering. It does not plan around obstacles: provide clear intermediate waypoints. Forward targets track the fifth-wheel position; `--reverse` targets track the trailer rear. A route blocked by an obstacle exits with an error. `walk-to` uses the same walking and collision code as human play.

### Complete an automated delivery

```sh
npm run truck -- demo --session acceptance
```

The demo resets the named session, parks, walks, registers, enters the PIN, loops through the apron and reverses into dock 03. It succeeds only if normal docking conditions are met. No teleports, phase overrides, disabled collisions, or recovery calls. The committed acceptance test completes with 0 contacts, 0 recoveries and approximately 0.15° trailer alignment error.

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
```

| Module                    | Owns                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/game/simulation.ts`  | Articulated kinematics, oriented collision, progression, proximity, parking/docking, measurements |
| `src/game/commands.ts`    | Validated CLI/WebMCP commands and feedback driver                                                 |
| `src/scene.ts`            | Three.js rendering, camera, lights, models, projected path                                        |
| `src/rig.ts`              | Driver rig: displacement-driven gait, turning, idle motion                                        |
| `src/main.ts`             | Input adapters, accessible overlays, HUD, sound and agent tool registration                       |
| `src/kiosk/`              | Kiosk replica: step flow, six-language copy, DOM view and stylesheet                              |
| `src/sms.ts`              | The driver's phone: SMS banner and handset with the Messages thread                               |
| `vite.config.ts`          | Local-only CLI/browser bridge                                                                     |
| `scripts/truck.ts`        | JSON command-line client and session persistence                                                  |
| `scripts/build_models.py` | Reproducible Blender asset authoring                                                              |

The renderer does not own physics. `State` is plain serializable data; `step` is the sole timed simulation transition. Explicit actions handle kiosk/PIN interaction. `predict` runs the same truck integrator for the visible path guide.

Collision uses oriented rectangles for both tractor and trailer. A closed gate and its side fences are real obstacles. Docking checks the trailer's rear, lateral error (<0.85 m), heading (<6°), bumper gap (−0.45…1.05 m), stopped speed and a 0.7 s hold. All measurements are in metres, seconds and radians; heading zero is +Z.

## Assets and design research

All 3D assets were authored in Blender from `scripts/build_models.py`, validated with Blender 5.2.1 LTS, and exported as GLB. A generated cab-over tractor, 13.6 m trailer, driver and yard require about 3.4 MB uncompressed. Assets include bevelled bodywork, mirrors, grille, multi-axle wheels, trailer rails, docking equipment, solar roof panels, fencing, kiosk, footpath, trees and lighting columns. Front wheels animate with steering. The driver's legs, arms, head and torso hang from named empties so the renderer can pose them. Distant scenery is joined by material to keep draw calls down.

The Peripass logo is the official first-party SVG. The house-style starting point is Montserrat and Peripass teal `#00A990`; the game adds dark green and lime feedback accents. The kiosk uses Open Sans and the kiosk app's tokens (page background `#F4F6F9`, primary teal, 56 px controls). Fonts are bundled locally. See [the cited research](docs/research.md) for the real yard process, control rationale, source links and which dimensions are deliberately simplified for play. This is a game, not a truck-driving simulator or an operational safety tool.

## Shipping

`npm run build` produces static `dist/`, suitable for the existing Vercel setup. A separate private Sites preview is configured in `.openai/hosting.json`. The original production domain is not changed by this branch. To replace v1, review and merge the v2 branch through your normal deployment workflow.
