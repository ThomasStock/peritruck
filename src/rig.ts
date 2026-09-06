import * as THREE from "three";
import {
  type Input,
  type State,
  KIOSK,
  angle,
  objective,
  walking,
} from "./game/simulation";
/** Procedural driver animation. Legs, arms, head and body hang from the named
 * empties authored in scripts/build_models.py. The gait is driven by the
 * simulation's actual displacement, so blocked or paused walking settles to
 * idle instead of marching in place. The same rig also poses the yard
 * operator: standing still, phone raised while dispatching. */
const CYCLE = 1.6; // metres per full gait cycle (two steps)
const LEG = 0.45,
  ARM = 0.55; // swing amplitudes, radians
export class DriverRig {
  private part: Record<string, THREE.Object3D | undefined> = {};
  private heading = 0;
  private gait = 0;
  private phase = 0;
  private roll = 0;
  private clock = 0;
  private lastMove = -1;
  private phone = 0;
  private last: { x: number; z: number } | null = null;
  constructor(private root: THREE.Object3D) {}
  bind() {
    for (const name of [
      "body",
      "head",
      "leg-left",
      "leg-right",
      "arm-left",
      "arm-right",
    ])
      this.part[name] = this.root.getObjectByName(name);
  }
  update(s: State, input: Input, dt: number, reducedMotion: boolean) {
    this.root.visible = walking(s);
    if (!this.root.visible) {
      this.last = null;
      this.gait = this.phase = this.roll = 0;
      return;
    }
    this.clock += dt;
    const d = s.driver;
    const moved = this.last
      ? Math.hypot(d.x - this.last.x, d.z - this.last.z)
      : Infinity;
    // First appearance, recovery or a CLI batch: settle facing the objective.
    const teleport = moved > 1.5;
    const command = Math.hypot(input.walkX, input.walkZ);
    let facing = this.heading;
    if (teleport) {
      const t = objective(s).target;
      facing = this.heading = Math.atan2(t.x - d.x, t.z - d.z);
      this.gait = 0;
    } else {
      if (moved > 1e-4) this.lastMove = this.clock;
      this.phase = (this.phase + (moved / CYCLE) * Math.PI * 2) % (Math.PI * 2);
      if (s.phase === "kiosk")
        facing = Math.atan2(KIOSK.x - d.x, KIOSK.z - d.z);
      else if (command > 0.1) facing = Math.atan2(input.walkX, input.walkZ);
    }
    this.last = { x: d.x, z: d.z };
    // Fixed-step simulation moves in quanta; a short window hides empty frames.
    const moving = this.clock - this.lastMove < 0.07;
    this.gait = THREE.MathUtils.damp(this.gait, moving ? 1 : 0, 10, dt);
    this.turn(facing, dt);
    // While the dock is being assigned the driver checks their own phone.
    this.phone = THREE.MathUtils.damp(
      this.phone,
      s.phase === "dispatch" ? 1 : 0,
      6,
      dt,
    );
    this.pose(d.x, d.z, reducedMotion);
  }
  /** Stand at a spot, facing `heading`; `phone` (0–1) raises the right hand
   * to eye level and drops the gaze onto it. For the yard operator. */
  stand(
    x: number,
    z: number,
    heading: number,
    phone: boolean,
    dt: number,
    reducedMotion: boolean,
  ) {
    this.root.visible = true;
    this.clock += dt;
    this.gait = THREE.MathUtils.damp(this.gait, 0, 10, dt);
    this.turn(heading, dt);
    this.phone = THREE.MathUtils.damp(this.phone, phone ? 1 : 0, 6, dt);
    this.pose(x, z, reducedMotion);
  }
  /** Walk a scene-owned route, with strides driven by actual displacement. */
  walk(
    x: number,
    z: number,
    heading: number,
    dt: number,
    reducedMotion: boolean,
  ) {
    this.root.visible = true;
    this.clock += dt;
    const moved = this.last ? Math.hypot(x - this.last.x, z - this.last.z) : 0;
    this.last = { x, z };
    if (moved > 1.5) {
      this.gait = this.phase = 0;
    } else {
      this.phase = (this.phase + (moved / CYCLE) * Math.PI * 2) % (Math.PI * 2);
      this.gait = THREE.MathUtils.damp(this.gait, moved > 1e-4 ? 1 : 0, 10, dt);
    }
    this.turn(heading, dt);
    this.phone = 0;
    this.pose(x, z, reducedMotion);
  }
  private turn(facing: number, dt: number) {
    const turn = angle(facing - this.heading) * (1 - Math.exp(-dt * 12));
    this.heading = angle(this.heading + turn);
    // Bank into turns, then recover upright.
    this.roll = THREE.MathUtils.damp(
      this.roll,
      THREE.MathUtils.clamp((-turn / Math.max(dt, 1e-3)) * 0.02, -0.12, 0.12),
      8,
      dt,
    );
  }
  private pose(x: number, z: number, reducedMotion: boolean) {
    const g = this.gait,
      motion = reducedMotion ? 0 : 1,
      idle = (1 - g) * motion,
      swing = Math.sin(this.phase),
      t = this.clock,
      phone = this.phone;
    this.root.position.set(x, motion * g * (0.035 - 0.075 * swing * swing), z);
    this.root.rotation.y = this.heading;
    const { body, head } = this.part;
    const legL = this.part["leg-left"],
      legR = this.part["leg-right"],
      armL = this.part["arm-left"],
      armR = this.part["arm-right"];
    if (legL) legL.rotation.x = LEG * g * swing;
    if (legR) legR.rotation.x = -LEG * g * swing;
    if (armL)
      armL.rotation.x =
        (-ARM * g * swing + idle * 0.04 * Math.sin(t * 1.1)) * (1 - phone) -
        phone * 0.35;
    if (armR) {
      // Forearm forward and up, the hand at chest height; a small thumb tremor.
      armR.rotation.x =
        (ARM * g * swing + idle * 0.04 * Math.sin(t * 1.1 + 1)) * (1 - phone) -
        phone * (1.55 + idle * 0.03 * Math.sin(t * 5.3));
      armR.rotation.z = -phone * 0.35;
    }
    if (body) {
      body.rotation.x = motion * 0.1 * g + idle * 0.012 * Math.sin(t * 2.1);
      body.rotation.y = -motion * 0.12 * g * swing; // shoulders follow the opposite arm
      body.rotation.z = motion * this.roll + idle * 0.02 * Math.sin(t * 0.8);
    }
    if (head) {
      head.rotation.y =
        -0.6 * (body?.rotation.y ?? 0) +
        idle *
          (1 - phone) *
          (0.3 * Math.sin(t * 0.7) + 0.12 * Math.sin(t * 1.9));
      // Looking down at the screen while the phone is up.
      head.rotation.x =
        motion * 0.04 * g * Math.cos(2 * this.phase) + phone * 0.5;
    }
  }
}
