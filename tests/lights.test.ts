import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createState, idleInput, type Input } from "../src/game/simulation";
import {
  BLINK_HZ,
  INDICATOR_THRESHOLD,
  RigLamps,
  lampState,
} from "../src/lights";

const truck = (speed: number) => ({ ...createState().truck, speed });
const input = (patch: Partial<Input>) => ({ ...idleInput(), ...patch });
const dark = {
  running: false,
  brake: false,
  reverse: false,
  left: false,
  right: false,
};

test("every lamp is dark while the engine is off, whatever the pedals say", () => {
  assert.deepEqual(
    lampState(
      truck(3),
      input({ throttle: -1, brake: true, steer: 1 }),
      0,
      false,
    ),
    dark,
  );
});

test("driving forward shows running lights only", () => {
  assert.deepEqual(lampState(truck(3), input({ throttle: 1 }), 0, true), {
    ...dark,
    running: true,
  });
  assert.deepEqual(lampState(truck(3), input({}), 0, true), {
    ...dark,
    running: true,
  });
});

test("brake lamps follow the brake pedal and a throttle against the motion", () => {
  assert.equal(
    lampState(truck(3), input({ brake: true }), 0, true).brake,
    true,
  );
  assert.equal(
    lampState(truck(0), input({ brake: true }), 0, true).brake,
    true,
  );
  const slowing = lampState(truck(3), input({ throttle: -1 }), 0, true);
  assert.equal(slowing.brake, true);
  assert.equal(slowing.reverse, false);
  assert.equal(
    lampState(truck(-1), input({ throttle: 1 }), 0, true).brake,
    true,
  );
});

test("reverse lamps light once reverse gear is in, and go out again", () => {
  const stopped = lampState(truck(0), input({ throttle: -1 }), 0, true);
  assert.equal(stopped.reverse, true);
  assert.equal(stopped.brake, false);
  const backing = lampState(truck(-1.5), input({ throttle: -1 }), 0, true);
  assert.equal(backing.reverse, true);
  assert.equal(backing.brake, false);
  assert.equal(lampState(truck(-1.5), input({}), 0, true).reverse, true);
  assert.equal(lampState(truck(0), input({}), 0, true).reverse, false);
  assert.equal(lampState(truck(2), input({}), 0, true).reverse, false);
});

test("indicators flash on the steered side at the blink rate", () => {
  const period = 1 / BLINK_HZ;
  const left = lampState(truck(2), input({ steer: 1 }), 0, true);
  assert.equal(left.left, true);
  assert.equal(left.right, false);
  const right = lampState(truck(2), input({ steer: -1 }), 0, true);
  assert.equal(right.left, false);
  assert.equal(right.right, true);
  assert.equal(
    lampState(truck(2), input({ steer: 1 }), period * 0.5 + 1e-6, true).left,
    false,
  );
  assert.equal(
    lampState(truck(2), input({ steer: 1 }), period, true).left,
    true,
  );
  const slight = input({ steer: INDICATOR_THRESHOLD * 0.9 });
  assert.equal(lampState(truck(2), slight, 0, true).left, false);
  const backing = lampState(
    truck(-1),
    input({ steer: -1, throttle: -1 }),
    0,
    true,
  );
  assert.equal(backing.right, true);
  assert.equal(backing.reverse, true);
});

async function loadModel(name: string) {
  const bytes = await readFile(
    new URL(`../public/models/${name}.glb`, import.meta.url),
  );
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
}
/** How brightly a material actually emits. Loaded GLTF materials arrive with
 * `emissiveIntensity` 1 and a black emissive colour, so intensity alone does
 * not say whether a lamp is lit. */
const glow = (m: THREE.MeshStandardMaterial) =>
  m.emissiveIntensity * Math.max(m.emissive.r, m.emissive.g, m.emissive.b);
function material(root: THREE.Object3D, name: string) {
  let found: THREE.MeshStandardMaterial | undefined;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && (o.material as THREE.Material).name === name)
      found = o.material as THREE.MeshStandardMaterial;
  });
  assert.ok(found, `${name} mesh`);
  return found;
}

test("the player's lamps glow on their own materials; parked copies keep the paint", async () => {
  const [tractor, trailer] = await Promise.all([
    loadModel("tractor"),
    loadModel("trailer"),
  ]);
  const parked = tractor.scene.clone(true);
  const parkedTrailer = trailer.scene.clone(true);
  const paintedHead = material(parked, "Headlamps"),
    paintedTail = material(parkedTrailer, "Tail lamps");
  const before = tractor.scene.children.length + trailer.scene.children.length;
  const lamps = new RigLamps();
  lamps.bind(tractor.scene, trailer.scene);
  const head = material(tractor.scene, "Headlamps"),
    tail = material(trailer.scene, "Tail lamps");
  assert.notEqual(head, paintedHead);
  assert.notEqual(tail, paintedTail);
  // Two reverse lamps and two indicators at the rear, two indicators in front.
  assert.equal(
    tractor.scene.children.length + trailer.scene.children.length,
    before + 6,
  );
  const hose = material(tractor.scene, "Tail lamps");
  lamps.update({
    running: true,
    brake: true,
    reverse: true,
    left: true,
    right: false,
  });
  assert.ok(glow(head) > 0);
  assert.ok(glow(tail) > 0);
  assert.equal(glow(paintedHead), 0);
  assert.equal(glow(paintedTail), 0);
  assert.equal(glow(hose), 0, "the tractor's red air hose is not a lamp");
  const glowing = new Set<THREE.Material>();
  for (const root of [tractor.scene, trailer.scene])
    root.traverse((o) => {
      if (
        o instanceof THREE.Mesh &&
        glow(o.material as THREE.MeshStandardMaterial) > 0
      )
        glowing.add(o.material as THREE.Material);
    });
  // Headlamps, tail lamps, reverse lamps and the left indicator; not the right.
  assert.equal(glowing.size, 4);
  const braking = glow(tail);
  lamps.update({
    running: true,
    brake: false,
    reverse: false,
    left: false,
    right: false,
  });
  assert.ok(glow(tail) > 0 && glow(tail) < braking);
  lamps.update(dark);
  assert.equal(glow(head), 0);
  assert.equal(glow(tail), 0);
});
