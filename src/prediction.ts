import * as THREE from "three";
import { predict, type Input, type State, type Truck } from "./game/simulation";

/** Exact prediction cache; snapshots also detect callers mutating State in place. */
export class PredictionPath {
  readonly geometry = new THREE.BufferGeometry();
  private truck?: Truck;
  private input?: Input;
  private assisted?: boolean;

  update(s: State, input: Input): boolean {
    const t = this.truck,
      i = this.input;
    if (
      t &&
      i &&
      t.x === s.truck.x &&
      t.z === s.truck.z &&
      t.heading === s.truck.heading &&
      t.trailerHeading === s.truck.trailerHeading &&
      t.speed === s.truck.speed &&
      t.steer === s.truck.steer &&
      i.throttle === input.throttle &&
      i.steer === input.steer &&
      i.brake === input.brake &&
      i.precision === input.precision &&
      this.assisted === s.assisted
    )
      return false;
    const points = predict(s, input);
    let position = this.geometry.getAttribute("position") as
      THREE.BufferAttribute | undefined;
    if (!position || position.count !== points.length) {
      position = new THREE.Float32BufferAttribute(points.length * 3, 3);
      position.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute("position", position);
    }
    for (let index = 0; index < points.length; index++) {
      const p = points[index];
      position.setXYZ(index, p.x, 0.22, p.z);
    }
    position.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.truck = { ...s.truck };
    this.input = { ...input };
    this.assisted = s.assisted;
    return true;
  }
}
