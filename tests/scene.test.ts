import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createYardCamera, mergeByMaterial } from "../src/scene";
import {
  angle,
  blendPoint,
  blendTruck,
  createState,
  idleInput,
  lerpAngle,
  predict,
  staticRigs,
  type State,
  type Truck,
  type Input,
} from "../src/game/simulation";
import { PredictionPath } from "../src/prediction";
import { ROUTE_CAPACITY, RouteDots } from "../src/route";

const paths: Partial<Record<State["phase"], number[][]>> = {
  arrive: [
    [-24, 59],
    [-24, 39],
  ],
  "walk-kiosk": [
    [-28, 37],
    [-28, 29],
    [-33.7, 28.2],
  ],
  gate: [
    [-24, 39],
    [-24, 28],
    [-17, 22],
    [5, 24],
    [28, 25],
    [37, 36],
    [37, 47],
    [27, 58],
    [18, 47],
    [18, 21.5],
  ],
  dock: [
    [18, 6],
    [18, -24],
    [9, -33],
    [0, -24],
    [0, 5],
  ],
};
paths.pin = paths.gate;
paths.kiosk = paths["walk-kiosk"];

test("instanced routes preserve every original dot transform and appearance in every phase", () => {
  const route = new RouteDots();
  const dots = route.mesh;
  const state = createState();
  for (const phase of [
    "arrive",
    "walk-kiosk",
    "kiosk",
    "walk-truck",
    "gate",
    "pin",
    "dock",
    "complete",
  ] as const) {
    state.phase = phase;
    assert.equal(route.update(state), true);
    const points = paths[phase] ?? [];
    const expected: number[][] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.6);
      for (let j = 0; j < n; j++) {
        const original = new THREE.Object3D();
        original.rotation.x = -Math.PI / 2;
        original.position.set(
          a[0] + ((b[0] - a[0]) * j) / n,
          0.12,
          a[1] + ((b[1] - a[1]) * j) / n,
        );
        original.updateMatrix();
        expected.push(Array.from(new Float32Array(original.matrix.elements)));
      }
    }
    assert.equal(dots.count, expected.length);
    assert.equal(dots.visible, expected.length > 0);
    if (!expected.length) continue;
    assert.ok(dots.isInstancedMesh);
    if (phase === "gate" || phase === "pin") assert.equal(dots.count, 93);
    for (let i = 0; i < dots.count; i++)
      assert.deepEqual(
        Array.from(dots.instanceMatrix.array.slice(i * 16, i * 16 + 16)),
        expected[i],
      );
    assert.equal(
      dots.geometry.parameters.radius,
      phase === "kiosk" || phase === "walk-kiosk" ? 0.17 : 0.23,
    );
    assert.equal(dots.geometry.parameters.segments, 12);
    assert.equal(
      dots.material.color.getHexString(),
      new THREE.Color("#baefe0").getHexString(),
    );
    assert.equal(dots.material.opacity, 0.65);
    assert.equal(dots.material.transparent, true);
    assert.equal(dots.material.depthWrite, false);
    assert.equal(dots.castShadow, false);
    assert.equal(dots.receiveShadow, false);
    assert.ok(dots.boundingSphere && dots.boundingSphere.radius > 0);
    assert.equal(route.update(state), false);
  }
});

test("route phase changes reuse one mesh, two geometries and one material without disposing", () => {
  const route = new RouteDots(),
    state = createState();
  const dots = route.mesh,
    material = dots.material,
    buffer = dots.instanceMatrix;
  assert.equal(dots.instanceMatrix.count, ROUTE_CAPACITY);
  assert.equal(ROUTE_CAPACITY, 93);
  const geometries = new Set<THREE.BufferGeometry>();
  const disposed: string[] = [];
  dots.addEventListener("dispose", () => disposed.push("instances"));
  material.addEventListener("dispose", () => disposed.push("material"));
  for (const phase of [
    "gate",
    "walk-kiosk",
    "dock",
    "complete",
    "kiosk",
    "pin",
    "arrive",
  ] as const) {
    state.phase = phase;
    route.update(state);
    if (dots.visible) {
      geometries.add(dots.geometry);
      dots.geometry.addEventListener("dispose", () =>
        disposed.push("geometry"),
      );
    }
    assert.equal(route.mesh, dots);
    assert.equal(dots.material, material);
    assert.equal(dots.instanceMatrix, buffer);
    assert.ok(dots.count <= ROUTE_CAPACITY);
  }
  assert.equal(geometries.size, 2);
  assert.deepEqual(disposed, []);
});

test("pose blending is exact at the ends and takes the short way round", () => {
  const a: Truck = {
    x: 0,
    z: 10,
    heading: Math.PI - 0.1,
    trailerHeading: -1,
    speed: 2,
    steer: -0.2,
  };
  const b: Truck = {
    x: 1,
    z: 12,
    heading: -Math.PI + 0.1,
    trailerHeading: 1,
    speed: 4,
    steer: 0.2,
  };
  assert.deepEqual(blendTruck(a, b, 0), a);
  assert.deepEqual(blendTruck(a, b, 1), {
    ...b,
    heading: angle(b.heading),
    trailerHeading: angle(b.trailerHeading),
  });
  const mid = blendTruck(a, b, 0.5);
  assert.deepEqual(
    { x: mid.x, z: mid.z, speed: mid.speed, steer: mid.steer },
    { x: 0.5, z: 11, speed: 3, steer: 0 },
  );
  // Crossing ±π: halfway between π−0.1 and −π+0.1 is π, not 0.
  assert.ok(
    Math.abs(Math.abs(mid.heading) - Math.PI) < 1e-12,
    `${mid.heading}`,
  );
  assert.equal(mid.trailerHeading, 0);
  assert.deepEqual(blendPoint({ x: 2, z: 4 }, { x: 4, z: 8 }, 0.25), {
    x: 2.5,
    z: 5,
  });
  assert.equal(lerpAngle(0.2, 0.2, 0.7), 0.2);
  assert.ok(Math.abs(lerpAngle(3, -3, 0.5) - Math.PI) < 1e-12);
  assert.deepEqual(blendTruck(a, a, 0.3), a);
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
const triangles = (g: THREE.BufferGeometry) =>
  (g.index ? g.index.count : g.getAttribute("position").count) / 3;

test("parked rigs merge into one mesh per material with geometry and materials intact", async () => {
  const [tractor, trailer] = await Promise.all([
    loadModel("tractor"),
    loadModel("trailer"),
  ]);
  const parked = new THREE.Group();
  const originals: THREE.Mesh[] = [];
  for (const t of staticRigs) {
    const cab = tractor.scene.clone(true),
      box = trailer.scene.clone(true);
    cab.position.set(t.x, 0, t.z);
    cab.rotation.y = t.heading;
    box.position.copy(cab.position);
    box.rotation.y = t.trailerHeading;
    parked.add(cab, box);
  }
  parked.updateMatrixWorld(true);
  parked.traverse((o) => {
    if (o instanceof THREE.Mesh) originals.push(o);
  });
  const materials = new Set(originals.map((o) => o.material as THREE.Material));
  const expectedTriangles = originals.reduce(
    (sum, o) => sum + triangles(o.geometry),
    0,
  );
  const expectedBounds = new THREE.Box3();
  for (const o of originals)
    expectedBounds.union(
      o.geometry.boundingBox
        ? o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)
        : new THREE.Box3().setFromObject(o),
    );
  const merged = mergeByMaterial(parked);
  assert.equal(originals.length, 3 * (29 + 8));
  assert.equal(merged.length, materials.size);
  assert.deepEqual(new Set(merged.map((m) => m.material)), materials);
  assert.equal(
    merged.reduce((sum, m) => sum + triangles(m.geometry), 0),
    expectedTriangles,
  );
  const bounds = new THREE.Box3();
  for (const m of merged) {
    assert.ok(m.castShadow && m.receiveShadow);
    assert.ok(
      m.geometry.boundingSphere && m.geometry.boundingSphere.radius > 0,
    );
    assert.ok(m.matrixWorld.equals(new THREE.Matrix4()));
    m.geometry.computeBoundingBox();
    bounds.union(m.geometry.boundingBox!);
  }
  for (const axis of ["x", "y", "z"] as const) {
    assert.ok(
      Math.abs(bounds.min[axis] - expectedBounds.min[axis]) < 1e-3,
      axis,
    );
    assert.ok(
      Math.abs(bounds.max[axis] - expectedBounds.max[axis]) < 1e-3,
      axis,
    );
  }
  // Every parked rig footprint is covered: sample one point per rig.
  for (const t of staticRigs) {
    const inside = merged.some((m) => {
      m.geometry.computeBoundingBox();
      return m.geometry.boundingBox!.containsPoint(
        new THREE.Vector3(t.x, 1.5, t.z),
      );
    });
    assert.ok(inside, `rig at ${t.x},${t.z}`);
  }
});

function assertPrediction(path: PredictionPath, state: State, input: Input) {
  const expected = new Float32Array(
    predict(state, input).flatMap((p) => [p.x, 0.22, p.z]),
  );
  assert.deepEqual(path.geometry.getAttribute("position").array, expected);
  assert.ok(path.geometry.boundingSphere);
}

test("prediction cache preserves exact points, reuses GPU buffers and detects mutations", () => {
  const path = new PredictionPath(),
    state = createState(),
    input = idleInput();
  assert.equal(path.update(state, input), true);
  const geometry = path.geometry,
    position = geometry.getAttribute("position") as THREE.BufferAttribute;
  assertPrediction(path, state, input);
  const version = position.version;
  assert.equal(path.update(state, input), false);
  assert.equal(position.version, version);
  for (const key of [
    "x",
    "z",
    "heading",
    "trailerHeading",
    "speed",
    "steer",
  ] as (keyof Truck)[]) {
    state.truck[key] += 0.25;
    assert.equal(path.update(state, input), true, key);
    assertPrediction(path, state, input);
    assert.equal(path.geometry, geometry);
    assert.equal(path.geometry.getAttribute("position"), position);
    assert.equal(path.update(state, input), false, key);
  }
  for (const key of ["throttle", "steer"] as const) {
    input[key] = -0.5;
    assert.equal(path.update(state, input), true, key);
    assertPrediction(path, state, input);
  }
  for (const key of ["precision", "brake"] as const) {
    input[key] = true;
    assert.equal(path.update(state, input), true, key);
    assertPrediction(path, state, input);
  }
  state.assisted = false;
  assert.equal(path.update(state, input), true);
  assertPrediction(path, state, input);
  // Unrelated state, identity and walking controls cannot alter the tyre track.
  state.elapsed++;
  state.phase = "dock";
  input.walkX = 1;
  input.walkZ = -1;
  assert.equal(path.update(structuredClone(state), { ...input }), false);
  state.truck = { ...state.truck, x: 10, z: 30 };
  assert.equal(path.update(state, input), true);
  assertPrediction(path, state, input);
});

test("cached prediction matches pure prediction across driving modes and steering inputs", () => {
  const path = new PredictionPath();
  for (const assisted of [false, true])
    for (const speed of [-2, 0, 3])
      for (const throttle of [-1, 0, 1])
        for (const steer of [-1, 0, 0.7])
          for (const precision of [false, true]) {
            const state = createState();
            state.assisted = assisted;
            Object.assign(state.truck, {
              x: 12.4,
              z: 18.9,
              heading: 0.2,
              trailerHeading: -0.1,
              speed,
              steer: 0.3,
            });
            const input = { ...idleInput(), throttle, steer, precision };
            path.update(state, input);
            assertPrediction(path, state, input);
          }
});

test("yard floor layers retain depth precision in every camera view", async () => {
  const bytes = await readFile(
    new URL("../public/models/yard.glb", import.meta.url),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  scene.updateMatrixWorld(true);
  const camera = createYardCamera();
  const depthSteps = 2 ** 24 - 1;
  const depth = (point: THREE.Vector3) =>
    ((point.clone().project(camera).z + 1) / 2) * depthSteps;
  const material = (hit: THREE.Intersection) =>
    ((hit.object as THREE.Mesh).material as THREE.Material).name;
  const views = [
    { name: "yard", offset: [109, 113, 128], focus: [0, 0, 13] },
    {
      name: "portrait yard",
      offset: [109 * 1.55, 113 * 1.55, 128 * 1.55],
      focus: [0, 0, 13],
    },
    { name: "follow", offset: [24, 34, 33], focus: [-24, 0, 43] },
    { name: "walking", offset: [14, 20, 19], focus: [-32, 0, 29] },
    { name: "overhead", offset: [0, 65, 0.1], focus: [0, 0, 13] },
  ];
  for (const view of views) {
    const focus = new THREE.Vector3(...view.focus);
    camera.position.copy(focus).add(new THREE.Vector3(...view.offset));
    camera.lookAt(focus);
    camera.updateMatrixWorld(true);
    let checked = 0;
    for (const x of [-45, -27, 1, 23, 45]) {
      for (const z of [-40, -31, -13, 1, 29, 43, 67]) {
        const direction = new THREE.Vector3(x, 0, z)
          .sub(camera.position)
          .normalize();
        const hits = new THREE.Raycaster(
          camera.position,
          direction,
        ).intersectObject(scene, true);
        const top = hits[0];
        if (!top || top.point.y > 0.1) continue;
        const projected = top.point.clone().project(camera);
        if (
          Math.abs(projected.x) > 1 ||
          Math.abs(projected.y) > 1 ||
          Math.abs(projected.z) > 1
        )
          continue;
        const beneath = hits.find((hit) => material(hit) !== material(top));
        if (!beneath) continue;
        const separation = depth(beneath.point) - depth(top.point);
        // Leave headroom for rasterization rounding between the broad slabs.
        assert.ok(
          separation >= 4,
          `${view.name} at (${x}, ${z}): ${material(top)} / ${material(beneath)} separated by only ${separation.toFixed(2)} depth steps`,
        );
        checked++;
      }
    }
    assert.ok(checked > 0, `${view.name} must sample the exported floor`);
  }
});
