# Sequential performance measurements

Implemented in `/Users/Thomas/code/peritruck-performance`, branch `codex/performance-review`, from freshly fetched trunk `77a053d`. Each change received its own baseline, implementation, after profile and review before proceeding. No product source edited in the original checkout; no deployment or push.

## 1. Batch route dots

Commit `b1e27d8` replaces individual circles with one `InstancedMesh` per route. Dot transforms, radii, colors, transparency and shadow settings remain equivalent; phase changes detach and dispose instance, geometry and material resources.

| Phase         | Dots | Total draw calls before → after | CPU median ms before → after | CPU p95 ms before → after |
| ------------- | ---: | ------------------------------: | ---------------------------: | ------------------------: |
| Arrive        |   13 |                       201 → 189 |                    0.6 → 0.5 |                 0.8 → 0.8 |
| Gate          |   93 |                       280 → 188 |                    0.7 → 0.5 |                 1.1 → 2.7 |
| PIN           |   93 |                       280 → 188 |                    0.8 → 0.5 |                 1.3 → 0.7 |
| Walk to kiosk |    9 |                       209 → 201 |                    0.4 → 0.4 |                 0.7 → 0.6 |
| Kiosk         |    9 |                       209 → 201 |                    0.4 → 0.4 |                 0.9 → 1.1 |
| Walk to truck |    0 |                       200 → 200 |                    0.4 → 0.4 |                 0.7 → 0.6 |
| Dock          |   54 |                       242 → 189 |                    0.6 → 0.5 |                 1.0 → 0.8 |
| Complete      |    0 |                       183 → 183 |                    0.4 → 0.3 |                 0.8 → 1.2 |

Gate route submissions fell from 93 to 1; the complete scene lost 92 draw calls. Gate geometry count fell from 184 to 92. Triangle counts and all Float32 route matrices match across all eight phases. Ten repeated phase cycles end at a stable 91 geometries and 2 textures. Before/after gate, walking and dock screenshots show the same route appearance. Each image pair differs at the same 22 of 1,024,000 pixels on static truck edges, unrelated to route positions; maximum channel difference 53, mean channel difference 0.00048.

Raw evidence: `artifacts/performance/step1-before.json`, `step1-after.json`, `step1-comparison.json` and `step1-{before,after}-{gate,walk-kiosk,dock}.png`.

## 2. Cache exact prediction and reuse its buffer

Commit `42f7ec0` adds `PredictionPath`. It snapshots truck pose, speed, steering, driving controls and assistance state; identical values reuse the prior trajectory. Changed values still call the original pure `predict` function, with all 360 fixed simulation steps. State mutations and replacement objects are both handled. Geometry and position attribute persist; changed positions update the buffer and bounding sphere. No approximation or update throttling.

| Scenario   | CPU median ms before → after | CPU p95 ms before → after | Geometry replacements before → after | Position refreshes before → after |
| ---------- | ---------------------------: | ------------------------: | -----------------------------------: | --------------------------------: |
| Stationary |                    0.5 → 0.4 |                 1.0 → 2.2 |                              150 → 0 |                           150 → 0 |
| Moving     |                    0.5 → 0.4 |                 2.7 → 2.0 |                              150 → 0 |                         150 → 150 |

Counts cover 150 measured frames after warmup. Stationary buffer refresh and prediction work disappear; moving predictions retain their original cadence with no geometry replacement. Both final trajectory arrays and truck poses match the baseline exactly. Tests compare Float32 points with pure `predict` across 108 combinations, plus individual input/pose mutations, assistance changes, buffer identity and cache hits.

Raw evidence: `artifacts/performance/step2-before.json`, `step2-after.json`, `step2-comparison.json` and corresponding logs/screenshots.

## 3. Prepare collision shapes and reject distant pairs

Static obstacle corners, axes and bounds are cached for open and closed gates, with a separate pedestrian obstacle list. Truck and pedestrian shapes are prepared once per collision query. An AABB test rejects only geometric separation; remaining pairs use the original axes, arithmetic and strict 0.005 SAT tolerance. Obstacle ordering and first collision labels remain intact.

`obstacles()` returns fresh copies. Changing the exported parked rig array's length, positions or orientations rebuilds the cache. Protected footpaths stay walkable; the gate and player truck still block pedestrians.

| Workload                      | Median batch ms before → after | p95 batch ms before → after | Median reduction |
| ----------------------------- | -----------------------------: | --------------------------: | ---------------: |
| 6,000 truck collision queries |                  120.35 → 9.33 |              307.30 → 13.40 |            92.2% |
| 6,000 walking steps           |                   69.77 → 9.57 |               90.68 → 11.89 |            86.3% |

These are times for **whole batches of 6,000 operations**, not per-query latency percentiles. The benchmark uses seed `0x5eeda11`, alternating gate states and fixed varied poses, three warmup batches and fifteen measured batches. Walking includes identical shallow State and driver copies in both versions. Outputs are consumed; checksums match (`2103522.5661087176`). Every benchmark collision result and complete walking State matches a frozen copy of trunk's simulation across 6,000 cases each. An independent reviewer repeat measured medians of 9.12 ms for collision and 9.60 ms for walking, with the same equivalence and checksum.

Tests additionally compare 6,000 random rectangle pairs in both directions, grazing/tolerance cases and rotated axes against an independent original SAT implementation; check 3,000 collision/walking cases, gate transitions, footpath access, public obstacle mutation isolation and parked rig cache invalidation. The full delivery test still completes with zero contacts and recoveries.

Raw evidence: `artifacts/performance/step3-before.json`, `step3-after.json`, corresponding logs and `reference-simulation.ts` (extracted from `77a053d`).

## Environment and interpretation

Browser profiles: Chrome `152.0.7977.83`, macOS arm64, Apple M4, ANGLE Metal renderer on Apple M4; 1280 × 800, DPR 1. Isolated same-origin development fixture loads the normal assets and `YardScene` without the app animation loop. Fixed yard camera, reduced motion, 30 warmup frames, then five batches of 30 frames. Moving prediction fixtures advance the truck at fixed `DT` outside the timed render interval.

Browser timings measure synchronous `YardScene.render` **CPU submission**, with `gl.finish()` outside the interval to prevent a growing GPU queue. They are not GPU times, end-to-end frame latency or FPS. Clock granularity is about 0.1 ms; browser/OS noise is visible in the raw batches. Gate and stationary p95 became worse despite lower medians. The strongest browser results are reduced draw calls and allocations; these measurements do not establish a general frame-rate or tail-latency improvement. Initial headless-shell SwiftShader profiling was stopped before product edits; every recorded paired browser profile uses the same hardware-backed Chrome configuration.

Collision profiles: Node `v23.10.0`, macOS arm64, Apple M4. The synthetic workload has many separated shapes and benefits strongly from the broadphase; gains in a particular live route will depend on its poses and obstacle density. The fifteen-batch p95 is the maximum sampled batch. Browser pairs were captured September 5, 2026; collision pairs September 6 local Brussels time (September 5 UTC).

Each JSON contains revision, source SHA256, environment, raw samples and summaries. After profiles were taken before committing their source changes, so their revision identifies the preceding stage and their hash identifies the changed code. Browser hashes cover scene/simulation, plus the new prediction helper once present. Artifacts are ignored by Git and remain in this worktree.

## Reproduction and validation

From the worktree:

```sh
npm ci
npm run dev -- --port 5187
```

With Playwright available on the module path, use `node scripts/profile-performance.mjs <label>`. For an externally installed Playwright, as in these runs:

```sh
PLAYWRIGHT_MODULE=/Users/Thomas/.npm/_npx/420ff84f11983ee5/node_modules/playwright/index.mjs node scripts/profile-performance.mjs current-browser
npx tsx scripts/profile-collisions.ts current-collisions
npm test
npm run build
npx prettier --check src/scene.ts src/prediction.ts src/game/simulation.ts tests/scene.test.ts tests/simulation.test.ts scripts/profile-performance.mjs scripts/profile-collisions.ts docs/performance.md
```

The commands above profile the current code with fresh labels, preserving the original paired artifacts. For historical baselines, use separate checkouts: trunk `77a053d` for stage 1, `b1e27d8` for stage 2 and `42f7ec0` for stage 3. Copy the required profiling script from the final version into the historical checkout, since trunk has no harness and stage 2 has no collision harness. The final browser harness records stationary/moving prediction scenarios added before stage 2; use the stage 1 commit's browser script for its exact original scenario set. Capture a new before label, apply that stage's product change, then capture a corresponding after label with the same script and settings. Preserve current edits and original measurement labels.

Validation: baseline 23 tests passed; stage 1 25; stage 2 27; stage 3 30. All stages passed TypeScript/Vite production builds and changed-file Prettier checks. The existing Vite warning about a chunk over 500 kB remains. Locked dependency installation reported zero vulnerabilities.

Maintenance: new trajectory physics dependencies must join the prediction key. New dynamic obstacles must participate in shape-cache invalidation. Rendering bounds must refresh whenever trajectory or instance positions change.
