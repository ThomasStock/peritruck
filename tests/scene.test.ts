import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { YardScene } from "../src/scene";
import { createState, type State } from "../src/game/simulation";

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
