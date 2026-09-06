import * as THREE from "three";
import { type Input, type Truck } from "./game/simulation";
/** Which lamps on the player's rig are lit this instant. */
export type Lamps = {
  /** Daytime running lights: headlamps and tail lamps, on with the engine. */
  running: boolean;
  brake: boolean;
  reverse: boolean;
  /** Indicators, blink phase included. Left is the driver's left (+x). */
  left: boolean;
  right: boolean;
};
/** Flashes per second; 90 per minute sits inside the legal 60–120 band. */
export const BLINK_HZ = 1.5;
/** Steering command beyond which the indicator on that side flashes. */
export const INDICATOR_THRESHOLD = 0.35;
const OFF: Lamps = {
  running: false,
  brake: false,
  reverse: false,
  left: false,
  right: false,
};
/** Lamp state from the same reading of speed and pedals as `integrate`:
 * the brake lamps light while the pedal is down or the throttle opposes the
 * motion, the reverse lamps once reverse gear is in, and an indicator while
 * the driver holds steering to that side. Everything is dark with the engine
 * off, i.e. whenever the driver is out of the cab. */
export function lampState(
  truck: Truck,
  input: Input,
  elapsed: number,
  engineOn: boolean,
): Lamps {
  if (!engineOn) return OFF;
  const throttle = THREE.MathUtils.clamp(input.throttle, -1, 1);
  const brake = input.brake || truck.speed * throttle < 0;
  const reverse =
    truck.speed < -0.03 || (Math.abs(truck.speed) < 0.03 && throttle < 0);
  const lit = Math.floor(elapsed * BLINK_HZ * 2) % 2 === 0;
  return {
    running: true,
    brake,
    reverse,
    left: lit && input.steer > INDICATOR_THRESHOLD,
    right: lit && input.steer < -INDICATOR_THRESHOLD,
  };
}
function lampMaterial(color: string, emissive: string) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0,
    roughness: 0.2,
    metalness: 0.1,
  });
}
/** Give the mesh painted with `name` its own copy of that material, so the
 * player's lamps can glow while the baked parked rigs keep the dull paint. */
function adopt(root: THREE.Object3D, name: string, emissive: string) {
  let own: THREE.MeshStandardMaterial | undefined;
  root.traverse((o) => {
    if (own || !(o instanceof THREE.Mesh)) return;
    const mat = o.material as THREE.MeshStandardMaterial;
    if (mat.name !== name) return;
    own = mat.clone();
    own.emissive.set(emissive);
    own.emissiveIntensity = 0;
    o.material = own;
  });
  return own;
}
function lamp(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
/** The working lamps on the player's rig. The headlamps and tail lamps are
 * the modelled ones with emissive materials; the reverse lamps and indicators
 * are added beside the tail lamps and over the painted front indicators.
 * Bind after the parked rigs are baked so they do not share the glow. */
export class RigLamps {
  private head?: THREE.MeshStandardMaterial;
  private tail?: THREE.MeshStandardMaterial;
  // Unlit lenses are deliberately dull: a lamp only reads as lit if its dark
  // state is dark. Amber sits outboard of the red cluster, as on EU trailers.
  private reverse = lampMaterial("#8f9a93", "#ffffff");
  private left = lampMaterial("#7d3506", "#ff8a00");
  private right = lampMaterial("#7d3506", "#ff8a00");
  bind(tractor: THREE.Object3D, trailer: THREE.Object3D) {
    this.head = adopt(tractor, "Headlamps", "#ffcf70");
    this.tail = adopt(trailer, "Tail lamps", "#ff0a00");
    const rear = new THREE.BoxGeometry(0.2, 0.14, 0.05);
    const front = new THREE.BoxGeometry(0.12, 0.13, 0.02);
    for (const side of [-1, 1]) {
      const indicator = side > 0 ? this.left : this.right;
      trailer.add(
        lamp(rear, indicator, side * 1.16, 1.03, -11.63),
        lamp(rear, this.reverse, side * 0.63, 1.03, -11.63),
      );
      tractor.add(lamp(front, indicator, side * 1.13, 1.4, 4.995));
    }
  }
  update(l: Lamps) {
    // A warm cast rather than a blow-out: the bumper behind them is white.
    if (this.head) this.head.emissiveIntensity = l.running ? 1.2 : 0;
    // Brake lamps stay red rather than blowing out to orange under ACES.
    if (this.tail)
      this.tail.emissiveIntensity = l.brake ? 1.15 : l.running ? 0.35 : 0;
    this.reverse.emissiveIntensity = l.reverse ? 3 : 0;
    this.left.emissiveIntensity = l.left ? 2.6 : 0;
    this.right.emissiveIntensity = l.right ? 2.6 : 0;
  }
}
