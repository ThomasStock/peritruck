import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DockArrival } from "../src/docks";
import { createState, DOCKS, DT, dockX } from "../src/game/simulation";

function fixture(dock = 3) {
  const arrival = new DockArrival();
  const state = createState();
  Object.assign(state, {
    phase: "dock",
    dispatched: true,
    gateOpen: true,
    dock,
  });
  Object.assign(state.truck, {
    x: dockX(dock),
    z: -5,
    heading: Math.PI,
    trailerHeading: Math.PI,
  });
  const camera = new THREE.PerspectiveCamera(40, 1.6, 1, 600);
  camera.position.set(dockX(dock) + 12, 18, 0);
  camera.lookAt(dockX(dock), 3, -44);
  const tick = (seconds: number, reduced = false) => {
    for (let i = 0; i < Math.ceil(seconds / DT); i++) {
      state.elapsed += DT;
      arrival.update(state, camera, DT, reduced);
    }
    arrival.root.updateMatrixWorld(true);
  };
  const shutter = (number = dock) =>
    arrival.root.getObjectByName(
      `dock-shutter-${number}`,
    ) as THREE.InstancedMesh;
  return { arrival, state, camera, tick, shutter };
}

test("assigned door opens at a distance in view; a closer truck calls the forklift", () => {
  for (const dock of [1, 2, 3]) {
    const { arrival, state, tick, shutter } = fixture(dock);
    tick(1);
    assert.equal(
      arrival.crew.visible,
      true,
      "worker appears while the shutter rises",
    );
    assert.equal(shutter().visible, true, "opening takes time");
    assert.equal(arrival.forklift.visible, false);
    tick(4);
    assert.equal(shutter().visible, false);
    assert.equal(
      arrival.forklift.visible,
      false,
      "forklift waits deeper inside",
    );
    for (const other of DOCKS.filter((d) => d.number !== dock))
      assert.equal(shutter(other.number).visible, true);
    state.truck.z = -28;
    tick(6);
    assert.equal(arrival.forklift.visible, true);
    assert.ok(
      arrival.forklift.position.z > -52 && arrival.forklift.position.z < -46.8,
    );
    tick(5);
    assert.equal(arrival.forklift.position.z, -46.8);
    assert.equal(arrival.crew.position.x, dockX(dock));
    // Turning away and pulling forward cannot close the door or recall the load.
    state.truck.z = 20;
    tick(1);
    assert.equal(shutter().visible, false);
    assert.equal(arrival.forklift.position.z, -46.8);
    state.phase = "complete";
    tick(1);
    assert.equal(arrival.crew.visible, true);
  }
});

test("offscreen and distant docks wait; a quick arrival still waits for shutter clearance", () => {
  const { arrival, state, camera, tick, shutter } = fixture();
  state.truck.z = 10;
  tick(4);
  assert.equal(arrival.crew.visible, false);
  state.truck.z = -28;
  camera.lookAt(0, 3, 60);
  tick(4);
  assert.equal(arrival.crew.visible, false);
  camera.lookAt(0, 3, -44);
  tick(2);
  assert.equal(shutter().visible, true);
  assert.equal(arrival.forklift.visible, false);
  tick(3);
  assert.equal(shutter().visible, false);
  assert.equal(arrival.forklift.visible, false);
  const worker = arrival.root.getObjectByName("dock-worker")!;
  const start = worker.position.z;
  tick(2);
  assert.ok(worker.position.z > start && worker.position.z < -45.05);
  assert.equal(arrival.forklift.visible, false);
  tick(2);
  assert.equal(worker.position.z, -45.05);
  assert.equal(
    arrival.forklift.visible,
    false,
    "worker pauses before the forklift arrives",
  );
  tick(1);
  assert.equal(arrival.forklift.visible, true);
});

test("reduced motion snaps to each stage; restart and reassignment reset the crew", () => {
  const { arrival, state, tick, shutter } = fixture();
  tick(DT, true);
  assert.equal(shutter().visible, false);
  assert.equal(arrival.forklift.visible, false);
  state.truck.z = -28;
  tick(DT, true);
  assert.equal(arrival.forklift.position.z, -46.8);
  Object.assign(state, createState());
  tick(DT);
  assert.equal(shutter().visible, true);
  assert.equal(arrival.crew.visible, false);
  assert.equal(arrival.forklift.visible, false);
  assert.equal(arrival.forklift.position.z, -52);
  Object.assign(state, {
    phase: "dock",
    dispatched: true,
    gateOpen: true,
    dock: 2,
  });
  Object.assign(state.truck, { x: -18, z: -18 });
  tick(8);
  assert.equal(arrival.crew.position.x, -18);
  assert.equal(shutter(3).visible, true);
  assert.equal(shutter(2).visible, false);
});

test("an edge glimpse cannot start the shutter, and a clear view must persist", () => {
  const { arrival, camera, tick } = fixture();
  camera.lookAt(0, 17, -44);
  camera.updateMatrixWorld();
  const centre = new THREE.Vector3(0, 3, -44).project(camera);
  assert.ok(Math.abs(centre.y) < 1, "door centre is onscreen near the edge");
  tick(4);
  assert.equal(arrival.crew.visible, false);
  camera.lookAt(0, 3, -44);
  tick(0.5);
  assert.equal(arrival.crew.visible, false);
  camera.lookAt(0, 3, 60);
  tick(0.1);
  camera.lookAt(0, 3, -44);
  tick(0.5);
  assert.equal(arrival.crew.visible, false, "losing sight resets the wait");
  tick(0.4);
  assert.equal(arrival.crew.visible, true);
});

test("dispatch, closed site gates and unavailable docks do not call a crew", () => {
  for (const override of [
    { dispatched: false },
    { gateOpen: false },
    { phase: "dispatch" as const },
    { dock: 4 },
    { dock: 5 },
  ]) {
    const { arrival, state, tick, shutter } = fixture();
    Object.assign(state, override);
    state.truck.z = -28;
    tick(10);
    assert.equal(arrival.crew.visible, false);
    assert.equal(shutter().visible, true);
  }
});

async function model(name: string) {
  const bytes = await readFile(
    new URL(`../public/models/${name}.glb`, import.meta.url),
  );
  return (
    await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    )
  ).scene;
}

test("authored openings reveal the interior; loaded forks and worker stay inside the dock", async () => {
  const [yard, forklift, driver] = await Promise.all([
    model("yard"),
    model("forklift"),
    model("driver"),
  ]);
  yard.updateMatrixWorld(true);
  for (const { x } of DOCKS) {
    // A solid facade or surround here would hide the worker and forklift.
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, 2.8, -43),
      new THREE.Vector3(0, 0, -1),
      0,
      10,
    );
    assert.equal(
      ray.intersectObject(yard, true).length,
      0,
      `dock at x=${x} has a clear opening`,
    );
  }
  const { arrival, state, tick } = fixture();
  arrival.bind(driver, forklift);
  state.truck.z = -28;
  tick(6);
  const walkingWorker = arrival.root.getObjectByName("dock-worker")!;
  assert.ok(
    walkingWorker.position.z > -48.3 && walkingWorker.position.z < -45.05,
  );
  const leg = walkingWorker.getObjectByName("leg-left")!;
  const stride = leg.rotation.x;
  tick(0.2);
  assert.notEqual(leg.rotation.x, stride, "walking swings the model's legs");
  assert.equal(arrival.forklift.visible, false);
  tick(10);
  const bounds = new THREE.Box3().setFromObject(arrival.forklift, true);
  assert.ok(bounds.max.z < -44.25, `forks stop inside: ${bounds.max.z}`);
  assert.ok(
    bounds.min.y >= 1.14,
    `wheels on the loading floor: ${bounds.min.y}`,
  );
  assert.ok(bounds.max.y < 5, `mast fits under the lintel: ${bounds.max.y}`);
  const worker = arrival.root.getObjectByName("dock-worker")!;
  const workerBounds = new THREE.Box3().setFromObject(worker);
  assert.ok(workerBounds.max.z < -44.25);
  assert.ok(workerBounds.min.x > -2.1 && workerBounds.max.x < 2.1);
  const wheels: THREE.Object3D[] = [];
  forklift.traverse((part) => {
    if (part.name.startsWith("forklift-wheel")) wheels.push(part);
  });
  assert.equal(wheels.length, 4);
  assert.ok(wheels.every((wheel) => wheel.rotation.x > 0));
});
