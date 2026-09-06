import * as THREE from "three";
import { type Truck, angle } from "./game/simulation";
/** Tyre radius in metres, as authored in scripts/build_models.py. */
export const WHEEL_RADIUS = 0.58;
/** Beyond this the pose was teleported (recover, restart, CLI batch) rather
 * than driven, so the wheels hold still instead of spinning through the jump. */
const JUMP = 1.5;
const JUMP_YAW = 0.35;
/** One `wheel-*` empty, with its offset from the rig's centre line. */
type Wheel = { pivot: THREE.Object3D; x: number; steered: boolean };
/** Collect the wheel pivots under a rig, noting where each sits across the
 * axle. Front wheels hang inside a `steering-*` empty that yaws with the steer. */
function collect(rig: THREE.Object3D): Wheel[] {
  const wheels: Wheel[] = [];
  const p = new THREE.Vector3();
  rig.updateMatrixWorld(true);
  rig.traverse((o) => {
    if (!o.name.startsWith("wheel-")) return;
    rig.worldToLocal(o.getWorldPosition(p));
    wheels.push({
      pivot: o,
      x: p.x,
      steered: o.parent?.name.startsWith("steering") ?? false,
    });
  });
  return wheels;
}
/** Rolls every wheel by the ground it actually covered.
 *
 * The hitch sits over the drive axle, so the rig's displacement along its
 * heading is what the drive tyres rolled. A steered wheel covers 1/cos(steer)
 * of that, and the trailer's axles cos(articulation). Yaw adds a differential:
 * a wheel on the inside of a turn covers less ground than one on the outside,
 * so the two sides visibly disagree while manoeuvring.
 *
 * Driving the roll from displacement rather than speed keeps the wheels still
 * whenever the rig is still, including while the game is paused and while the
 * renderer interpolates a pose the simulation has not advanced. */
export class RigWheels {
  private tractor: Wheel[] = [];
  private trailer: Wheel[] = [];
  private last = { x: 0, z: 0, heading: 0, trailerHeading: 0, seen: false };
  bind(tractor: THREE.Object3D, trailer: THREE.Object3D) {
    this.tractor = collect(tractor);
    this.trailer = collect(trailer);
  }
  update(t: Truck, reducedMotion = false) {
    const last = this.last;
    const dx = t.x - last.x,
      dz = t.z - last.z,
      yaw = angle(t.heading - last.heading),
      trailerYaw = angle(t.trailerHeading - last.trailerHeading),
      jump =
        !last.seen ||
        dx * dx + dz * dz > JUMP * JUMP ||
        Math.abs(yaw) > JUMP_YAW;
    last.x = t.x;
    last.z = t.z;
    last.heading = t.heading;
    last.trailerHeading = t.trailerHeading;
    last.seen = true;
    if (jump || reducedMotion) return;
    // Signed travel along the heading: reversing rolls the wheels backwards.
    const drive = dx * Math.sin(t.heading) + dz * Math.cos(t.heading);
    const steered = drive / Math.cos(t.steer);
    const towed = drive * Math.cos(angle(t.heading - t.trailerHeading));
    for (const w of this.tractor) spin(w, w.steered ? steered : drive, yaw);
    for (const w of this.trailer) spin(w, towed, trailerYaw);
  }
}
/** Advance one wheel by `along` metres of axle travel, less the share a yaw of
 * `dYaw` takes from a wheel sitting `x` metres off the centre line. */
function spin(w: Wheel, along: number, dYaw: number) {
  const r = w.pivot.rotation;
  r.x = (r.x + (along - w.x * dYaw) / WHEEL_RADIUS) % (Math.PI * 2);
}
