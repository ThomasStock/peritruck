import * as THREE from "three";
import { type Input, type Truck } from "./game/simulation";
/** Which lamps on the player's rig are lit this instant. */
export type Lamps = {
  /** Daytime running lights: headlamps and tail lamps, on with the engine. */
  running: boolean;
  brake: boolean;
  reverse: boolean;
};
const OFF: Lamps = { running: false, brake: false, reverse: false };
/** Lamp state from the same reading of speed and pedals as `integrate`:
 * the brake lamps light while the pedal is down or the throttle opposes the
 * motion, and the reverse lamps once reverse gear is in. Everything is dark
 * with the engine off, i.e. whenever the driver is out of the cab. */
export function lampState(
  truck: Truck,
  input: Input,
  engineOn: boolean,
): Lamps {
  if (!engineOn) return OFF;
  const throttle = THREE.MathUtils.clamp(input.throttle, -1, 1);
  return {
    running: true,
    brake: input.brake || truck.speed * throttle < 0,
    reverse:
      truck.speed < -0.03 || (Math.abs(truck.speed) < 0.03 && throttle < 0),
  };
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
/** The working lamps on the player's rig. The headlamps and tail lamps are
 * the modelled ones with emissive materials; the reverse lamps are added
 * beside the tail lamps. Bind after the parked rigs are baked so they do not
 * share the glow. */
export class RigLamps {
  private head?: THREE.MeshStandardMaterial;
  private tail?: THREE.MeshStandardMaterial;
  // The unlit lens is deliberately dull: a lamp only reads as lit if its dark
  // state is dark.
  private reverse = new THREE.MeshStandardMaterial({
    color: "#8f9a93",
    emissive: "#ffffff",
    emissiveIntensity: 0,
    roughness: 0.2,
    metalness: 0.1,
  });
  bind(tractor: THREE.Object3D, trailer: THREE.Object3D) {
    this.head = adopt(tractor, "Headlamps", "#ffcf70");
    this.tail = adopt(trailer, "Tail lamps", "#ff0a00");
    const geometry = new THREE.BoxGeometry(0.2, 0.14, 0.05);
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(geometry, this.reverse);
      mesh.position.set(side * 0.63, 1.03, -11.63);
      mesh.castShadow = mesh.receiveShadow = true;
      trailer.add(mesh);
    }
  }
  update(l: Lamps) {
    // A warm cast rather than a blow-out: the bumper behind them is white.
    if (this.head) this.head.emissiveIntensity = l.running ? 1.2 : 0;
    // Brake lamps stay red rather than blowing out to orange under ACES.
    if (this.tail)
      this.tail.emissiveIntensity = l.brake ? 1.15 : l.running ? 0.35 : 0;
    this.reverse.emissiveIntensity = l.reverse ? 3 : 0;
  }
}
