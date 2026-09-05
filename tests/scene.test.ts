import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createYardCamera } from "../src/scene";

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
