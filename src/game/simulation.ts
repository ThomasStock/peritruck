/** Renderer-free, deterministic yard simulation. Metres, seconds, radians.
 * Heading 0 = +Z. Positive steering turns left from the driver's seat.
 * All entry points (keyboard, touch, CLI, WebMCP) use these transitions.
 */
export type Point = { x: number; z: number };
export type Truck = Point & {
  heading: number;
  trailerHeading: number;
  speed: number;
  steer: number;
};
export type Phase =
  | "arrive"
  | "walk-kiosk"
  | "kiosk"
  | "walk-truck"
  | "gate"
  | "pin"
  | "dock"
  | "complete";
export type Input = {
  throttle: number;
  steer: number;
  brake: boolean;
  precision: boolean;
  walkX: number;
  walkZ: number;
};
export type State = {
  version: 2;
  phase: Phase;
  truck: Truck;
  driver: Point;
  assisted: boolean;
  gateOpen: boolean;
  registered: boolean;
  /** Simulation time at which the check-in SMS reaches the driver's phone. */
  smsAt: number;
  pin: string;
  booking: string;
  elapsed: number;
  distance: number;
  contacts: number;
  recoveries: number;
  parkingHold: number;
  dockHold: number;
  collisionCooldown: number;
  message: string;
  messageUntil: number;
  checkpoint: Truck;
  events: { time: number; type: string; detail: string }[];
};
export const DT = 1 / 60;
export const RIG = {
  wheelbase: 3.57,
  trailerAxle: 8.5,
  rear: 11.5,
  front: 5,
  width: 2.55,
  maxSteer: 0.57,
};
export const YARD = {
  park: { x: -24, z: 43.5, w: 6, d: 23 },
  kiosk: { x: -33.7, z: 28.2 },
  gate: { x: 18, z: 21.5 },
  dock: { x: 0, z: -44 },
  gateZ: 12,
};
/** Speeds (m/s) below which a driving step can complete. */
export const STOP_SPEED = { park: 0.18, gate: 0.3, dock: 0.18 };
/** Radius (m) around a driving target inside which excess speed warns the driver. */
export const SLOW_ZONE = 4;
/** Seconds between leaving the kiosk and the gate PIN landing on the driver's phone. */
export const SMS_DELAY = 2;
/** The booking reference printed on the delivery note: fixed prefix, six-character body. */
export const BOOKING = "PP-K4M7Q2";
/** A fresh four-digit gate PIN for every session; leading zeros are kept. */
export const randomPin = () =>
  String(Math.floor(Math.random() * 10000)).padStart(4, "0");
export const idleInput = (): Input => ({
  throttle: 0,
  steer: 0,
  brake: false,
  precision: false,
  walkX: 0,
  walkZ: 0,
});
export const clamp = (x: number, min: number, max: number) =>
  Math.min(max, Math.max(min, x));
export const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export const forward = (h: number): Point => ({
  x: Math.sin(h),
  z: Math.cos(h),
});
export const offset = (p: Point, h: number, d: number): Point => ({
  x: p.x + Math.sin(h) * d,
  z: p.z + Math.cos(h) * d,
});
export const rear = (t: Truck) => offset(t, t.trailerHeading, -RIG.rear);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Interpolate the short way round, so a heading crossing ±π does not spin.
 * Equal inputs return the input itself, so a rig at rest keeps an exact pose. */
export const lerpAngle = (a: number, b: number, t: number) => {
  const turn = angle(b - a);
  return turn === 0 ? a : angle(a + turn * t);
};
export const blendPoint = (a: Point, b: Point, t: number): Point => ({
  x: lerp(a.x, b.x, t),
  z: lerp(a.z, b.z, t),
});
/** Pose between two consecutive fixed steps. Renderers draw this at the display
 * rate so motion stays continuous whatever the refresh rate; the simulation
 * itself never sees blended values. */
export const blendTruck = (a: Truck, b: Truck, t: number): Truck => ({
  x: lerp(a.x, b.x, t),
  z: lerp(a.z, b.z, t),
  heading: lerpAngle(a.heading, b.heading, t),
  trailerHeading: lerpAngle(a.trailerHeading, b.trailerHeading, t),
  speed: lerp(a.speed, b.speed, t),
  steer: lerp(a.steer, b.steer, t),
});
export const walking = (s: State) =>
  ["walk-kiosk", "walk-truck", "kiosk"].includes(s.phase);
/** The check-in SMS with the gate PIN has arrived. Sessions saved before the delay existed count as delivered. */
export const smsReceived = (s: State) =>
  s.registered && s.elapsed >= (s.smsAt ?? 0);
export function createState(): State {
  const truck = {
    x: -24,
    z: 62,
    heading: Math.PI,
    trailerHeading: Math.PI,
    speed: 0,
    steer: 0,
  };
  return {
    version: 2,
    phase: "arrive",
    truck,
    driver: { x: -27, z: 38 },
    assisted: true,
    gateOpen: false,
    registered: false,
    smsAt: 0,
    pin: randomPin(),
    booking: BOOKING,
    elapsed: 0,
    distance: 0,
    contacts: 0,
    recoveries: 0,
    parkingHold: 0,
    dockHold: 0,
    collisionCooldown: 0,
    message: "",
    messageUntil: 0,
    checkpoint: { ...truck },
    events: [],
  };
}
/** Record a progression event without showing a toast. */
export function log(s: State, type: string, detail: string) {
  s.events.push({ time: Math.round(s.elapsed * 100) / 100, type, detail });
  s.events = s.events.slice(-100);
}
export function note(s: State, detail: string, type = "hint") {
  s.message = detail;
  s.messageUntil = s.elapsed + 4;
  if (type !== "hint") log(s, type, detail);
}
export type Rect = Point & { w: number; d: number; h: number; name?: string };
export function rigRects(t: Truck): Rect[] {
  return [
    { ...offset(t, t.heading, 1.75), w: 2.5, d: 6.5, h: t.heading },
    {
      ...offset(t, t.trailerHeading, -4.7),
      w: 2.55,
      d: 13.6,
      h: t.trailerHeading,
    },
  ];
}
export function corners(r: Rect): Point[] {
  const f = forward(r.h),
    side = { x: Math.cos(r.h), z: -Math.sin(r.h) };
  return [-1, 1].flatMap((a) =>
    [-1, 1].map((b) => ({
      x: r.x + (f.x * r.d * a) / 2 + (side.x * r.w * b) / 2,
      z: r.z + (f.z * r.d * a) / 2 + (side.z * r.w * b) / 2,
    })),
  );
}
type PreparedRect = {
  rect: Rect;
  points: Point[];
  axes: Point[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};
function prepareRect(rect: Rect): PreparedRect {
  const points = corners(rect);
  return {
    rect,
    points,
    axes: [forward(rect.h), forward(rect.h + Math.PI / 2)],
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxZ: Math.max(...points.map((p) => p.z)),
  };
}
function preparedOverlap(a: PreparedRect, b: PreparedRect): boolean {
  // Reject only geometric separation. The SAT tolerance belongs to its own axes.
  if (a.maxX < b.minX || b.maxX < a.minX || a.maxZ < b.minZ || b.maxZ < a.minZ)
    return false;
  for (const axes of [a.axes, b.axes])
    for (const axis of axes) {
      let aMin = Infinity,
        aMax = -Infinity,
        bMin = Infinity,
        bMax = -Infinity;
      for (const p of a.points) {
        const projection = p.x * axis.x + p.z * axis.z;
        aMin = Math.min(aMin, projection);
        aMax = Math.max(aMax, projection);
      }
      for (const p of b.points) {
        const projection = p.x * axis.x + p.z * axis.z;
        bMin = Math.min(bMin, projection);
        bMax = Math.max(bMax, projection);
      }
      if (!(aMax > bMin + 0.005 && bMax > aMin + 0.005)) return false;
    }
  return true;
}
export function overlap(a: Rect, b: Rect): boolean {
  return preparedOverlap(prepareRect(a), prepareRect(b));
}
export const staticRigs: Truck[] = [
  {
    x: -42,
    z: 38.5,
    heading: Math.PI,
    trailerHeading: Math.PI,
    speed: 0,
    steer: 0,
  },
  {
    x: -6,
    z: 38.5,
    heading: Math.PI,
    trailerHeading: Math.PI,
    speed: 0,
    steer: 0,
  },
  { x: 36, z: -32.2, heading: 0, trailerHeading: 0, speed: 0, steer: 0 },
];
const obstacle = (
  x: number,
  z: number,
  w: number,
  d: number,
  name: string,
): Rect => ({ x, z, w, d, h: 0, name });
/** The kiosk housing. The driver faces its centre while checking in. */
export const KIOSK: Readonly<Rect> = obstacle(-33.7, 26, 1.1, 0.8, "Kiosk");
function buildObstacles(gateOpen: boolean): Rect[] {
  return [
    obstacle(-53, 14, 2, 132, "Perimeter fence"),
    obstacle(53, 14, 2, 132, "Perimeter fence"),
    obstacle(0, -54.6, 106, 20, "Warehouse"),
    obstacle(0, 81, 106, 2, "Site boundary"),
    obstacle(-20.2, 12, 64, 0.4, "Security fence"),
    obstacle(38, 12, 28, 0.4, "Security fence"),
    ...(gateOpen
      ? []
      : [
          obstacle(
            18,
            12,
            12,
            0.4,
            "Gate closed · register and enter your PIN",
          ),
        ]),
    obstacle(-41, 21, 9, 5, "Reception"),
    { ...KIOSK },
    obstacle(-32.5, 39, 2.6, 39, "Protected footpath"),
    ...staticRigs.flatMap((t) =>
      rigRects(t).map((r) => ({ ...r, name: "Parked truck" })),
    ),
  ];
}
type ObstacleSet = { all: PreparedRect[]; walking: PreparedRect[] };
let obstacleCache: { open: ObstacleSet; closed: ObstacleSet } | undefined;
let parkedSnapshot: Truck[] = [];
function preparedObstacles(s: State): ObstacleSet {
  // staticRigs is a public mutable array. Rebuild only when a shape actually changes.
  if (
    !obstacleCache ||
    parkedSnapshot.length !== staticRigs.length ||
    staticRigs.some((t, i) => {
      const last = parkedSnapshot[i];
      return (
        t.x !== last.x ||
        t.z !== last.z ||
        t.heading !== last.heading ||
        t.trailerHeading !== last.trailerHeading
      );
    })
  ) {
    const build = (open: boolean): ObstacleSet => {
      const all = buildObstacles(open).map(prepareRect);
      return {
        all,
        walking: all.filter((o) => o.rect.name !== "Protected footpath"),
      };
    };
    obstacleCache = { open: build(true), closed: build(false) };
    parkedSnapshot = staticRigs.map((t) => ({ ...t }));
  }
  return s.gateOpen ? obstacleCache.open : obstacleCache.closed;
}
/** Fresh copies retain the public API without exposing the prepared caches. */
export function obstacles(s: State): Rect[] {
  return preparedObstacles(s).all.map((o) => ({ ...o.rect }));
}
export function collision(s: State, t = s.truck): string | undefined {
  const rects = rigRects(t).map(prepareRect);
  return preparedObstacles(s).all.find((o) =>
    rects.some((r) => preparedOverlap(r, o)),
  )?.rect.name;
}
export function parking(s: State) {
  const p = YARD.park;
  const inside = rigRects(s.truck)
    .flatMap(corners)
    .every(
      (c) => Math.abs(c.x - p.x) <= p.w / 2 && Math.abs(c.z - p.z) <= p.d / 2,
    );
  const straight =
    Math.abs(angle(s.truck.heading - s.truck.trailerHeading)) < 0.16;
  const stopped = Math.abs(s.truck.speed) < STOP_SPEED.park;
  return { inside, straight, stopped, ready: inside && straight && stopped };
}
export function docking(s: State) {
  const tail = rear(s.truck),
    lateral = Math.abs(tail.x - YARD.dock.x),
    gap = tail.z - YARD.dock.z;
  const headingError = Math.abs(angle(s.truck.trailerHeading));
  return {
    lateral,
    gap,
    headingError,
    angleDegrees: (headingError * 180) / Math.PI,
    ready:
      lateral < 0.85 &&
      gap > -0.45 &&
      gap < 1.05 &&
      headingError < 0.105 &&
      Math.abs(s.truck.speed) < STOP_SPEED.dock,
  };
}
export function objective(s: State): {
  title: string;
  detail: string;
  target: Point;
  step: number;
} {
  switch (s.phase) {
    case "arrive":
      return {
        title: "Driver parking",
        detail: "Pull into holding bay P02, then come to a stop.",
        target: { x: -24, z: 39 },
        step: 0,
      };
    case "walk-kiosk":
    case "kiosk":
      return {
        title: "Self-service check-in",
        detail: "Follow the footpath to the driver check-in kiosk.",
        target: YARD.kiosk,
        step: 1,
      };
    case "walk-truck":
      return {
        title: "Driver instructions",
        detail: smsReceived(s)
          ? "Your gate PIN arrived by SMS. Walk back to the cab."
          : "Checked in. Your gate PIN is on its way by SMS.",
        target: offset(s.truck, s.truck.heading + Math.PI / 2, 2.5),
        step: 1,
      };
    case "gate":
    case "pin":
      return {
        title: "Automated access",
        detail: "Stop at the gate’s white line and enter your PIN.",
        target: YARD.gate,
        step: 2,
      };
    case "dock":
      return {
        title: "Assigned dock: 03",
        detail: "Turn in the apron. Reverse your trailer into dock 03.",
        target: { x: 0, z: -32.5 },
        step: 3,
      };
    case "complete":
      return {
        title: "Ready for unloading",
        detail: "Trailer positioned at dock 03.",
        target: YARD.dock,
        step: 4,
      };
  }
}
export function prompt(s: State): string {
  if (s.phase === "arrive" && parking(s).ready) return "Park & step out";
  if (s.phase === "walk-kiosk" && distance(s.driver, YARD.kiosk) < 2.4)
    return "Check in at kiosk";
  if (s.phase === "walk-truck" && distance(s.driver, s.truck) < 5.3)
    return "Get back in";
  if (
    s.phase === "gate" &&
    distance(s.truck, YARD.gate) < 6 &&
    Math.abs(s.truck.speed) < STOP_SPEED.gate
  )
    return "Enter gate PIN";
  return "";
}
/** Within SLOW_ZONE of the driving target but still too fast for the step to complete. */
export function slowDown(s: State): boolean {
  const limit =
    s.phase === "arrive"
      ? STOP_SPEED.park
      : s.phase === "gate"
        ? STOP_SPEED.gate
        : s.phase === "dock"
          ? STOP_SPEED.dock
          : undefined;
  return (
    limit !== undefined &&
    distance(s.truck, objective(s).target) <= SLOW_ZONE &&
    Math.abs(s.truck.speed) >= limit
  );
}
export function interact(s: State): boolean {
  if (!prompt(s)) {
    note(
      s,
      walking(s)
        ? "Move closer to the marked destination."
        : "Stop in the marked area first.",
    );
    return false;
  }
  s.truck.speed = 0;
  if (s.phase === "arrive") {
    s.phase = "walk-kiosk";
    s.driver = offset(s.truck, s.truck.heading + Math.PI / 2, 2.5);
    s.driver.z -= 2;
    s.checkpoint = { ...s.truck };
    note(s, "Parked safely. The kiosk is along the footpath.", "parked");
  } else if (s.phase === "walk-kiosk") s.phase = "kiosk";
  else if (s.phase === "walk-truck") {
    s.phase = "gate";
    s.checkpoint = { ...s.truck };
    note(s, `Gate PIN ${s.pin} · Dock 03`, "entered-truck");
  } else if (s.phase === "gate") s.phase = "pin";
  return true;
}
export function register(s: State, booking: string): boolean {
  if (s.phase !== "kiosk") {
    note(s, "Check in at the kiosk first.");
    return false;
  }
  if (booking.trim().toUpperCase() !== s.booking) {
    note(s, `Use booking reference ${s.booking} from your delivery note.`);
    return false;
  }
  s.registered = true;
  s.phase = "walk-truck";
  // The SMS lands a moment after the driver leaves the kiosk; the UI shows it then.
  s.smsAt = s.elapsed + SMS_DELAY;
  log(s, "registered", `Checked in with ${s.booking}. Gate PIN sent by SMS.`);
  return true;
}
/** Safe stop just inside the barrier once the gate has opened. */
const insideGate: Truck = {
  x: 18,
  z: -2,
  heading: Math.PI,
  trailerHeading: Math.PI,
  speed: 0,
  steer: 0,
};
export function enterPin(s: State, pin: string): boolean {
  if (s.phase !== "pin" || !s.registered) {
    note(s, "Stop at the gate terminal first.");
    return false;
  }
  if (pin !== s.pin) {
    note(s, `That PIN doesn’t match. Your message says ${s.pin}.`);
    return false;
  }
  s.gateOpen = true;
  s.phase = "dock";
  note(s, "Access granted. Proceed to dock 03.", "gate-opened");
  s.checkpoint = { ...insideGate };
  return true;
}
/** Truck parked straight in holding bay P02, as after a clean arrival. */
const parkedInBay: Truck = {
  x: -24,
  z: 39.5,
  heading: Math.PI,
  trailerHeading: Math.PI,
  speed: 0,
  steer: 0,
};
/** Stopped at the gate's white line, facing the barrier. */
const atGateLine: Truck = {
  x: YARD.gate.x,
  z: 22,
  heading: Math.PI,
  trailerHeading: Math.PI,
  speed: 0,
  steer: 0,
};
/** Trailer rear squared up 0.45 m from dock 03; docking accepts this at once. */
const docked: Truck = {
  x: YARD.dock.x,
  z: YARD.dock.z + RIG.rear + 0.45,
  heading: 0,
  trailerHeading: 0,
  speed: 0,
  steer: 0,
};
/** A skipped kiosk still hands the driver the PIN; a pending SMS lands now. */
function deliverPin(s: State) {
  if (!s.registered || s.smsAt > s.elapsed) s.smsAt = s.elapsed;
  s.registered = true;
}
function skipToGateLine(s: State) {
  deliverPin(s);
  s.truck = { ...atGateLine };
  s.checkpoint = { ...atGateLine };
  s.phase = "gate";
  return true;
}
function skipToDock(s: State) {
  deliverPin(s);
  s.truck = { ...docked };
  s.gateOpen = true;
  s.phase = "dock";
  s.dockHold = 0;
  s.checkpoint = { ...insideGate };
  return true;
}
/** Playtest shortcut (hold X): jump to the next place the driver has to act.
 * Arriving → parked, standing at the kiosk. Standing at the kiosk, or walking
 * back → checked in, stopped at the gate line. Stopped at the line, or past the
 * gate → docked, so the delivery completes on the next hold. Silent: no toast. */
export function skipAhead(s: State): boolean {
  switch (s.phase) {
    case "arrive":
    case "walk-kiosk":
      if (s.phase === "walk-kiosk" && prompt(s)) return skipToGateLine(s);
      s.truck = { ...parkedInBay };
      s.checkpoint = { ...parkedInBay };
      s.driver = { x: YARD.kiosk.x, z: YARD.kiosk.z + 0.2 };
      s.phase = "walk-kiosk";
      return true;
    case "kiosk":
    case "walk-truck":
      return skipToGateLine(s);
    case "gate":
      return prompt(s) ? skipToDock(s) : skipToGateLine(s);
    case "pin":
    case "dock":
      return skipToDock(s);
    default:
      return false;
  }
}
export function recover(s: State) {
  if (s.phase === "complete") return;
  s.recoveries++;
  s.truck = { ...s.checkpoint };
  s.dockHold = 0;
  if (walking(s)) {
    s.driver = offset(s.truck, s.truck.heading + Math.PI / 2, 2.5);
    if (s.phase === "kiosk") s.phase = "walk-kiosk";
  }
  if (s.phase === "pin") s.phase = "gate";
  note(s, "Returned to the last safe stop.", "recovered");
}
/** Truck physics used by both live simulation and projected tyre tracks. */
export function integrate(
  t: Truck,
  input: Input,
  assisted: boolean,
  dt: number,
) {
  const throttle = clamp(input.throttle, -1, 1),
    steer = clamp(input.steer, -1, 1);
  const maxSpeed = input.precision ? 1.35 : 5.5; // 20 km/h site speed
  const reverseMax = input.precision ? 0.8 : 2.1;
  const desired = throttle * (throttle < 0 ? reverseMax : maxSpeed);
  const braking = input.brake || t.speed * throttle < 0;
  const acceleration = braking ? 6.5 : throttle === 0 ? 3.5 : 2.5;
  t.speed += clamp(
    (input.brake ? 0 : desired) - t.speed,
    -acceleration * dt,
    acceleration * dt,
  );
  const reverse = t.speed < -0.03 || (Math.abs(t.speed) < 0.03 && throttle < 0);
  let targetSteer: number;
  if (reverse && assisted) {
    // A positive command aims the trailer to its left while travelling backwards.
    // Track a requested articulation with feed-forward equilibrium + feedback.
    const beta = angle(t.heading - t.trailerHeading),
      desiredBeta = -steer * 0.4;
    targetSteer =
      Math.atan((RIG.wheelbase / RIG.trailerAxle) * Math.sin(beta)) +
      1.55 * (beta - desiredBeta);
  } else {
    targetSteer =
      steer * RIG.maxSteer * (1 - (0.18 * Math.abs(t.speed)) / maxSpeed);
  }
  targetSteer = clamp(targetSteer, -RIG.maxSteer, RIG.maxSteer);
  t.steer += clamp(targetSteer - t.steer, -1.8 * dt, 1.8 * dt);
  t.heading = angle(
    t.heading + (t.speed / RIG.wheelbase) * Math.tan(t.steer) * dt,
  );
  t.x += Math.sin(t.heading) * t.speed * dt;
  t.z += Math.cos(t.heading) * t.speed * dt;
  t.trailerHeading = angle(
    t.trailerHeading +
      (t.speed / RIG.trailerAxle) *
        Math.sin(angle(t.heading - t.trailerHeading)) *
        dt,
  );
}
export function step(s: State, input = idleInput(), dt = DT) {
  if (s.phase === "complete" || s.phase === "kiosk" || s.phase === "pin")
    return;
  // Fixed step only; callers subdivide durations, avoiding tunnelling/frame-rate dependence.
  dt = clamp(dt, 0, DT);
  s.elapsed += dt;
  s.collisionCooldown = Math.max(0, s.collisionCooldown - dt);
  if (walking(s)) {
    const len = Math.max(1, Math.hypot(input.walkX, input.walkZ));
    const p = {
      x: s.driver.x + (input.walkX / len) * 3 * dt,
      z: s.driver.z + (input.walkZ / len) * 3 * dt,
    };
    const rect = prepareRect({ ...p, w: 0.55, d: 0.55, h: 0 });
    // Pedestrians can use the protected path, but cannot walk through trucks or the gate.
    const blocked =
      preparedObstacles(s).walking.some((o) => preparedOverlap(rect, o)) ||
      rigRects(s.truck).some((o) => preparedOverlap(rect, prepareRect(o)));
    if (!blocked) s.driver = p;
    return;
  }
  const before = { ...s.truck };
  integrate(s.truck, input, s.assisted, dt);
  const obstacleName = collision(s);
  const jackknife =
    Math.abs(angle(s.truck.heading - s.truck.trailerHeading)) > 1.12 &&
    s.truck.speed < 0;
  if (obstacleName || jackknife) {
    s.truck = { ...before, speed: 0 };
    if (s.collisionCooldown <= 0 && Math.abs(before.speed) > 0.02) {
      if (!jackknife) s.contacts++;
      note(
        s,
        jackknife
          ? "Trailer getting tight. Pull forward to straighten up."
          : `${obstacleName}. Brake, then pull away.`,
        jackknife ? "jackknife" : "contact",
      );
      s.collisionCooldown = 1.5;
    }
  } else s.distance += distance(before, s.truck);
  if (s.phase === "dock") {
    s.dockHold = docking(s).ready ? s.dockHold + dt : 0;
    if (s.dockHold > 0.7) {
      s.phase = "complete";
      s.truck.speed = 0;
      note(s, "Delivered to dock 03.", "completed");
    }
  }
}
export function advance(s: State, input: Input, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120)
    throw new Error("Duration must be between 0 and 120 seconds.");
  for (let i = 0; i < Math.round(seconds / DT); i++) step(s, input);
}
export function predict(s: State, input: Input): Point[] {
  const t = { ...s.truck };
  const points: Point[] = [];
  const reversing = t.speed < -0.03 || input.throttle < 0;
  const preview = {
    ...input,
    throttle: reversing ? -0.65 : 0.6,
    precision: true,
    brake: false,
  };
  for (let i = 0; i < 360; i++) {
    integrate(t, preview, s.assisted, DT);
    if (i % 12 === 0)
      points.push(reversing ? rear(t) : offset(t, t.heading, RIG.front));
  }
  return points;
}
export function snapshot(s: State) {
  const round = (x: number) => Math.round(x * 1000) / 1000;
  return {
    phase: s.phase,
    truck: Object.fromEntries(
      Object.entries(s.truck).map(([k, v]) => [k, round(v)]),
    ),
    driver: s.driver,
    speedKmh: round(s.truck.speed * 3.6),
    articulationDegrees: round(
      (angle(s.truck.heading - s.truck.trailerHeading) * 180) / Math.PI,
    ),
    assisted: s.assisted,
    gateOpen: s.gateOpen,
    registered: s.registered,
    smsReceived: smsReceived(s),
    objective: objective(s),
    interaction: prompt(s),
    slowDown: slowDown(s),
    parking: parking(s),
    docking: docking(s),
    pin: s.registered ? s.pin : null,
    elapsed: round(s.elapsed),
    distance: round(s.distance),
    contacts: s.contacts,
    recoveries: s.recoveries,
    events: s.events,
  };
}
