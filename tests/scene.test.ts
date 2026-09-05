import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { YardScene, createYardCamera } from "../src/scene";
import {
  createState,
  idleInput,
  predict,
  type State,
  type Truck,
  type Input,
} from "../src/game/simulation";
import { PredictionPath } from "../src/prediction";

// Exercise the route lifecycle without creating a WebGL renderer.
function routeFixture() {
  const view = Object.create(YardScene.prototype) as {
    route: THREE.Group;
    lastRoute: string;
    updateRoute(s: State): void;
  };
  view.route = new THREE.Group();
  view.lastRoute = "";
  return view;
}

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
  const view = routeFixture();
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
    view.updateRoute(state);
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
    assert.equal(view.route.children.length, expected.length ? 1 : 0);
    if (!expected.length) continue;
    const dots = view.route.children[0] as THREE.InstancedMesh<
      THREE.CircleGeometry,
      THREE.MeshBasicMaterial
    >;
    assert.ok(dots.isInstancedMesh);
    assert.equal(dots.count, expected.length);
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
    view.updateRoute(state);
    assert.equal(view.route.children[0], dots);
  }
});

test("route phase changes release instance, geometry and material resources and detach children", () => {
  const view = routeFixture(),
    state = createState();
  state.phase = "gate";
  view.updateRoute(state);
  const dots = view.route.children[0] as THREE.InstancedMesh<
    THREE.CircleGeometry,
    THREE.MeshBasicMaterial
  >;
  const disposed: string[] = [];
  dots.addEventListener("dispose", () => disposed.push("instances"));
  dots.geometry.addEventListener("dispose", () => disposed.push("geometry"));
  dots.material.addEventListener("dispose", () => disposed.push("material"));
  state.phase = "complete";
  view.updateRoute(state);
  assert.deepEqual(disposed, ["instances", "geometry", "material"]);
  assert.equal(dots.parent, null);
  assert.equal(view.route.children.length, 0);
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
