/** Deterministic, renderer-free profile and differential check against trunk. */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import * as current from "../src/game/simulation";

const label = process.argv[2] ?? "collision-profile";
const out = path.resolve("artifacts/performance");
await mkdir(out, { recursive: true });
const referencePath = path.join(out, "reference-simulation.ts");
await writeFile(
  referencePath,
  execFileSync("git", ["show", "77a053d:src/game/simulation.ts"]),
);
const reference: typeof current = await import(
  pathToFileURL(referencePath).href
);
let seed = 0x5eeda11;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const corpus = Array.from({ length: 6000 }, (_, i) => {
  const state = current.createState();
  state.gateOpen = i % 2 === 0;
  state.phase = "walk-kiosk";
  state.truck = {
    x: -58 + random() * 116,
    z: -60 + random() * 145,
    heading: (random() - 0.5) * Math.PI * 2,
    trailerHeading: (random() - 0.5) * Math.PI * 2,
    speed: 0,
    steer: 0,
  };
  state.driver = { x: -55 + random() * 110, z: -57 + random() * 140 };
  const input = {
    ...current.idleInput(),
    walkX: random() * 2 - 1,
    walkZ: random() * 2 - 1,
  };
  return { state, input };
});
let checksum = 0;
for (const { state, input } of corpus) {
  assert.equal(current.collision(state), reference.collision(state));
  const a = structuredClone(state),
    b = structuredClone(state);
  current.step(a, input);
  reference.step(b, input);
  assert.deepEqual(a, b);
}
function measure(name: string, work: () => void) {
  for (let i = 0; i < 3; i++) work();
  const batches = [];
  for (let i = 0; i < 15; i++) {
    const t = performance.now();
    work();
    batches.push(performance.now() - t);
  }
  const sorted = [...batches].sort((a, b) => a - b);
  return {
    name,
    queriesPerBatch: corpus.length,
    batches,
    medianMs: sorted[7],
    p95Ms: sorted[14],
  };
}
const collision = measure("collision", () => {
  for (const { state } of corpus)
    checksum += current.collision(state)?.length ?? 0;
});
const walking = measure("walking-step", () => {
  for (const { state, input } of corpus) {
    const s = { ...state, driver: { ...state.driver } };
    current.step(s, input);
    checksum += s.driver.x + s.driver.z;
  }
});
const result = {
  label,
  timestamp: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceHash: createHash("sha256")
    .update(await readFile("src/game/simulation.ts"))
    .digest("hex"),
  environment: {
    node: process.version,
    platform: os.platform(),
    arch: os.arch(),
    cpu: os.cpus()[0].model,
  },
  method:
    "Seed0x5eeda11;6000 mixed poses, alternating gate states;3 warmup and15 measured batches;all outputs consumed. Each phase uses identical frozen pose corpus. Walking includes shallow State copy and driver copy in both versions.",
  equivalence: { collision: corpus.length, walking: corpus.length },
  collision,
  walking,
  checksum,
};
await writeFile(
  path.join(out, `${label}.json`),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
