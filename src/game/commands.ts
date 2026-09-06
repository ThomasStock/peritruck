import {
  type State,
  type Point,
  createState,
  step,
  advance,
  idleInput,
  snapshot,
  interact,
  register,
  dispatch,
  enterPin,
  recover,
  walking,
  clamp,
  angle,
  distance,
  rear,
  YARD,
  DT,
  DISPATCH_DELAY,
  docking,
} from "./simulation";
export type Command = { op: string; [key: string]: unknown };
function number(value: unknown, name: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${name} must be a finite number.`);
  return value;
}
function bool(value: unknown, name: string, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean.`);
  return value;
}
export function brake(s: State) {
  const input = idleInput();
  input.brake = true;
  advance(s, input, 1);
}
/** A closed-loop driver, using observations and normal steering/throttle only. */
export function driveTo(
  s: State,
  target: Point,
  reverse = false,
  stop = true,
  tolerance = 0.55,
  limit = 80,
) {
  if (walking(s) || ["kiosk", "pin", "complete"].includes(s.phase))
    throw new Error("The driver must be in the truck.");
  const start = s.elapsed;
  for (let i = 0; i < limit / DT; i++) {
    const tracked = reverse ? rear(s.truck) : s.truck;
    const d = distance(tracked, target);
    if (d < tolerance) {
      if (stop) brake(s);
      return;
    }
    const desired =
      Math.atan2(target.x - tracked.x, target.z - tracked.z) +
      (reverse ? Math.PI : 0);
    const error = angle(
      desired - (reverse ? s.truck.trailerHeading : s.truck.heading),
    );
    const input = idleInput();
    input.steer = clamp(error * (reverse ? 2.8 : 1.8), -1, 1);
    const speed = stop ? clamp(d * 0.65, 0.24, reverse ? 1.2 : 3.2) : 3.2;
    input.throttle = ((reverse ? -1 : 1) * speed) / (reverse ? 2.1 : 5.5);
    step(s, input);
    if (s.phase === "complete") return;
    if (
      s.contacts > 0 &&
      s.events.at(-1)?.type === "contact" &&
      s.elapsed - start > 5 &&
      Math.abs(s.truck.speed) < 0.001
    )
      throw new Error(`Route blocked: ${s.message}`);
  }
  throw new Error(
    `Navigation timeout at ${s.truck.x.toFixed(2)},${s.truck.z.toFixed(2)} toward ${target.x},${target.z}.`,
  );
}
export function walkTo(s: State, target: Point) {
  if (!walking(s) || s.phase === "kiosk")
    throw new Error("Step out of the truck before walking.");
  const start = s.elapsed;
  while (distance(s.driver, target) > 0.3 && s.elapsed - start < 60) {
    // The operator's phone buzzed: time is frozen until the dock is assigned.
    if (s.phase === "dispatch")
      throw new Error(
        "The yard operator is assigning your dock. Run dispatch --dock N first.",
      );
    const input = idleInput();
    input.walkX = target.x - s.driver.x;
    input.walkZ = target.z - s.driver.z;
    step(s, input);
  }
  if (distance(s.driver, target) > 0.4)
    throw new Error("Footpath blocked. Try an intermediate waypoint.");
}
export function demo(s: State) {
  Object.assign(s, createState());
  driveTo(s, { x: -24, z: 39 });
  if (!interact(s)) throw new Error("Demo could not park.");
  walkTo(s, { x: -28, z: 29 });
  walkTo(s, YARD.kiosk);
  interact(s);
  register(s, s.booking);
  // The driver waits by the kiosk while the yard operator calls them off to dock 03.
  advance(s, idleInput(), DISPATCH_DELAY + 0.5);
  if (!dispatch(s, 3)) throw new Error("Demo could not dispatch.");
  walkTo(s, { x: -28, z: 29 });
  walkTo(s, { x: -27, z: 37 });
  interact(s);
  // Move forward out of the bay, swing right in the clear arrival apron.
  driveTo(s, { x: -24, z: 26 }, false, false, 2);
  driveTo(s, { x: -16, z: 23 }, false, false, 2);
  driveTo(s, { x: 5, z: 24 }, false, false, 2);
  driveTo(s, { x: 28, z: 25 }, false, false, 2);
  driveTo(s, { x: 37, z: 36 }, false, false, 2);
  driveTo(s, { x: 37, z: 47 }, false, false, 2);
  driveTo(s, { x: 27, z: 58 }, false, false, 2);
  driveTo(s, { x: 18, z: 47 }, false, false, 2);
  driveTo(s, { x: 18, z: 22 });
  interact(s);
  if (!enterPin(s, s.pin)) throw new Error("Demo gate check failed.");
  driveTo(s, { x: 18, z: -24 }, false, false, 2);
  driveTo(s, { x: 9, z: -33 }, false, false, 2);
  driveTo(s, { x: 0, z: -24 }, false, false, 2);
  driveTo(s, { x: 0, z: 5 });
  driveTo(s, { x: 0, z: -43.9 }, true, true, 0.35);
  advance(s, idleInput(), 1);
  if (s.phase !== "complete")
    throw new Error("Demo did not satisfy the docking conditions.");
  return snapshot(s);
}
export function execute(s: State, raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("A command object is required.");
  const c = raw as Command;
  switch (c.op) {
    case "status":
      break;
    case "reset":
      Object.assign(s, createState());
      break;
    case "input": {
      const i = idleInput();
      i.throttle = number(c.throttle, "throttle", 0);
      i.steer = number(c.steer, "steer", 0);
      i.brake = bool(c.brake, "brake");
      i.precision = bool(c.precision, "precision");
      i.walkX = number(c.walkX, "walkX", 0);
      i.walkZ = number(c.walkZ, "walkZ", 0);
      if ([i.throttle, i.steer, i.walkX, i.walkZ].some((x) => Math.abs(x) > 1))
        throw new Error("Inputs must be between -1 and 1.");
      advance(s, i, number(c.seconds, "seconds", 1));
      break;
    }
    case "interact":
      if (!interact(s)) throw new Error(s.message);
      break;
    case "register":
      if (typeof c.booking !== "string")
        throw new Error("booking must be a string.");
      if (!register(s, c.booking)) throw new Error(s.message);
      break;
    case "pin":
      if (typeof c.pin !== "string") throw new Error("pin must be a string.");
      if (!enterPin(s, c.pin)) throw new Error(s.message);
      break;
    case "dispatch":
      if (!dispatch(s, number(c.dock, "dock"))) throw new Error(s.message);
      break;
    case "recover":
      recover(s);
      break;
    case "assist":
      s.assisted = bool(c.enabled, "enabled", true);
      break;
    case "drive-to":
      driveTo(
        s,
        { x: number(c.x, "x"), z: number(c.z, "z") },
        bool(c.reverse, "reverse"),
        bool(c.stop, "stop", true),
        number(c.tolerance, "tolerance", 0.55),
      );
      break;
    case "walk-to":
      walkTo(s, { x: number(c.x, "x"), z: number(c.z, "z") });
      break;
    case "demo":
      demo(s);
      break;
    default:
      throw new Error(`Unknown command: ${String(c.op)}`);
  }
  return snapshot(s);
}
