import * as THREE from "three";
import {
  type Input,
  type State,
  angle,
  objective,
  obstacles,
  walking,
} from "./game/simulation";
/** Procedural driver animation. Legs, arms, head and body hang from the named
 * empties authored in scripts/build_models.py. The gait is driven by the
 * simulation's actual displacement, so blocked or paused walking settles to
 * idle instead of marching in place. */
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
      if (s.phase === "kiosk") {
        const kiosk = obstacles(s).find((o) => o.name === "Kiosk");
        if (kiosk) facing = Math.atan2(kiosk.x - d.x, kiosk.z - d.z);
      } else if (command > 0.1) facing = Math.atan2(input.walkX, input.walkZ);
    }
    this.last = { x: d.x, z: d.z };
    // Fixed-step simulation moves in quanta; a short window hides empty frames.
    const moving = this.clock - this.lastMove < 0.07;
    this.gait = THREE.MathUtils.damp(this.gait, moving ? 1 : 0, 10, dt);
    const turn = angle(facing - this.heading) * (1 - Math.exp(-dt * 12));
    this.heading = angle(this.heading + turn);
    // Bank into turns, then recover upright.
    this.roll = THREE.MathUtils.damp(
      this.roll,
      THREE.MathUtils.clamp((-turn / Math.max(dt, 1e-3)) * 0.02, -0.12, 0.12),
      8,
      dt,
    );
    const g = this.gait,
      motion = reducedMotion ? 0 : 1,
      idle = (1 - g) * motion,
      swing = Math.sin(this.phase),
      t = this.clock;
    this.root.position.set(
      d.x,
      motion * g * (0.035 - 0.075 * swing * swing),
      d.z,
    );
    this.root.rotation.y = this.heading;
    const { body, head } = this.part;
    const legL = this.part["leg-left"],
      legR = this.part["leg-right"],
      armL = this.part["arm-left"],
      armR = this.part["arm-right"];
    if (legL) legL.rotation.x = LEG * g * swing;
    if (legR) legR.rotation.x = -LEG * g * swing;
    if (armL)
      armL.rotation.x = -ARM * g * swing + idle * 0.04 * Math.sin(t * 1.1);
    if (armR)
      armR.rotation.x = ARM * g * swing + idle * 0.04 * Math.sin(t * 1.1 + 1);
    if (body) {
      body.rotation.x = motion * 0.1 * g + idle * 0.012 * Math.sin(t * 2.1);
      body.rotation.y = -motion * 0.12 * g * swing; // shoulders follow the opposite arm
      body.rotation.z = motion * this.roll + idle * 0.02 * Math.sin(t * 0.8);
    }
    if (head) {
      head.rotation.y =
        -0.6 * (body?.rotation.y ?? 0) +
        idle * (0.3 * Math.sin(t * 0.7) + 0.12 * Math.sin(t * 1.9));
      head.rotation.x = motion * 0.04 * g * Math.cos(2 * this.phase);
    }
  }
}
