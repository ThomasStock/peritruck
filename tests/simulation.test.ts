import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  idleInput,
  advance,
  integrate,
  DT,
  angle,
  parking,
  docking,
  collision,
  interact,
  register,
  enterPin,
  recover,
  rigRects,
  overlap,
  step,
  rear,
  slowDown,
  YARD,
  type State,
} from "../src/game/simulation";
import { execute, demo, driveTo, walkTo } from "../src/game/commands";

test("complete delivery through real controls: park, walk, register, PIN, reverse dock", () => {
  const s = createState();
  demo(s);
  assert.equal(s.phase, "complete");
  assert.equal(s.contacts, 0);
  assert.equal(s.recoveries, 0);
  assert.ok(s.distance > 300);
  assert.ok(docking(s).angleDegrees < 1);
  assert.ok(docking(s).ready);
  assert.deepEqual(
    s.events.map((e) => e.type),
    ["parked", "registered", "entered-truck", "gate-opened", "completed"],
  );
});

test("deterministic controls produce identical outcomes and replay split durations", () => {
  const a = createState(),
    b = createState();
  const i = { ...idleInput(), throttle: 1, steer: 0.17 };
  advance(a, i, 3);
  advance(b, i, 1);
  advance(b, i, 2);
  assert.deepEqual(a, b);
});

test("release stops, opposite pedal brakes before automatic reverse, precision caps speed", () => {
  const s = createState();
  advance(s, { ...idleInput(), throttle: 1 }, 1);
  assert.ok(s.truck.speed > 0);
  advance(s, { ...idleInput(), throttle: -1 }, 0.1);
  assert.ok(s.truck.speed > 0);
  advance(s, { ...idleInput(), throttle: -1 }, 1);
  assert.ok(s.truck.speed < 0);
  advance(s, idleInput(), 1);
  assert.equal(s.truck.speed, 0);
  advance(s, { ...idleInput(), throttle: 1, precision: true }, 2);
  assert.ok(s.truck.speed <= 1.35);
});

test("neutral assisted reversing corrects articulation without changing trailer angle by force", () => {
  const t = {
    ...createState().truck,
    x: 0,
    z: 0,
    heading: 0.3,
    trailerHeading: 0,
    speed: -1,
  };
  const i = { ...idleInput(), throttle: -0.5 };
  const before = Math.abs(angle(t.heading - t.trailerHeading));
  let maxDelta = 0;
  for (let k = 0; k < 900; k++) {
    const h = t.trailerHeading;
    integrate(t, i, true, DT);
    maxDelta = Math.max(maxDelta, Math.abs(angle(t.trailerHeading - h)));
  }
  assert.ok(Math.abs(angle(t.heading - t.trailerHeading)) < before * 0.1);
  assert.ok(maxDelta < 0.001);
});

test("assisted left and right commands turn trailer in opposite intended directions", () => {
  for (const sign of [-1, 1]) {
    const t = {
      ...createState().truck,
      x: 0,
      z: 0,
      heading: 0,
      trailerHeading: 0,
    };
    for (let k = 0; k < 300; k++)
      integrate(t, { ...idleInput(), throttle: -0.5, steer: sign }, true, DT);
    assert.ok(t.trailerHeading * sign > 0);
    assert.ok(Math.abs(angle(t.heading - t.trailerHeading)) < 0.6);
  }
});

test("cannot park with just the cab, angled trailer, or a moving rig", () => {
  const s = createState();
  s.truck.z = 39;
  assert.ok(parking(s).ready);
  s.truck.speed = 1;
  assert.equal(parking(s).ready, false);
  s.truck.speed = 0;
  s.truck.trailerHeading = Math.PI - 0.5;
  assert.equal(parking(s).ready, false);
  s.truck.trailerHeading = Math.PI;
  s.truck.z = 52;
  assert.equal(parking(s).ready, false);
});

test("dock success requires rear-first alignment, lateral position and stationary hold", () => {
  const s = createState();
  s.phase = "dock";
  s.gateOpen = true;
  s.truck = {
    x: 0,
    z: -32.2,
    heading: 0,
    trailerHeading: 0,
    speed: 0,
    steer: 0,
  };
  assert.ok(docking(s).ready);
  advance(s, idleInput(), 0.5);
  assert.equal(s.phase, "dock");
  advance(s, idleInput(), 0.3);
  assert.equal(s.phase, "complete");
  const wrong = createState();
  wrong.phase = "dock";
  wrong.truck = { ...s.truck, heading: Math.PI, trailerHeading: Math.PI };
  assert.equal(docking(wrong).ready, false);
  wrong.truck = { ...s.truck, x: 1.5 };
  assert.equal(docking(wrong).ready, false);
  wrong.truck = { ...s.truck, speed: -0.7 };
  assert.equal(docking(wrong).ready, false);
});

test("slow-down warning appears within 4 m of each driving target until the step can complete", () => {
  const s = createState();
  // Holding bay: target is 2 m ahead.
  s.truck.z = 41;
  s.truck.speed = 1;
  assert.ok(slowDown(s));
  s.truck.speed = 0.1;
  assert.equal(slowDown(s), false);
  s.truck.speed = 1;
  s.truck.z = 50;
  assert.equal(slowDown(s), false);
  // Gate: prompt accepts anything under 0.3 m/s.
  s.phase = "gate";
  s.truck = { ...s.truck, x: YARD.gate.x, z: YARD.gate.z + 3, speed: 0.5 };
  assert.ok(slowDown(s));
  s.truck.speed = 0.25;
  assert.equal(slowDown(s), false);
  s.truck = { ...s.truck, z: YARD.gate.z + 4.5, speed: 0.5 };
  assert.equal(slowDown(s), false);
  // Dock: reversing at 2.5 m from the target.
  s.phase = "dock";
  s.truck = { ...s.truck, x: 0, z: -30, speed: -0.5 };
  assert.ok(slowDown(s));
  s.truck.speed = -0.1;
  assert.equal(slowDown(s), false);
  // Walking has no speed to shed.
  s.phase = "walk-kiosk";
  s.driver = { x: YARD.kiosk.x, z: YARD.kiosk.z + 3 };
  s.truck.speed = 2;
  assert.equal(slowDown(s), false);
});

test("gate blocks cab and trailer, including when cab has crossed it", () => {
  const s = createState();
  s.truck = {
    x: 18,
    z: 16,
    heading: Math.PI,
    trailerHeading: Math.PI,
    speed: 0,
    steer: 0,
  };
  assert.match(collision(s) ?? "", /Gate closed/);
  s.gateOpen = true;
  assert.equal(collision(s), undefined);
  s.gateOpen = false;
  s.truck.z = 4;
  assert.match(collision(s) ?? "", /Gate closed/);
});

test("open barrier still enforces its flanking security fence", () => {
  const s = createState();
  s.gateOpen = true;
  s.truck = {
    x: 0,
    z: 16,
    heading: Math.PI,
    trailerHeading: Math.PI,
    speed: 0,
    steer: 0,
  };
  assert.equal(collision(s), "Security fence");
});

test("collision rolls back pose and stops truck, instead of clipping through obstacle", () => {
  const s = createState();
  s.truck = {
    x: 18,
    z: 22,
    heading: Math.PI,
    trailerHeading: Math.PI,
    speed: 0,
    steer: 0,
  };
  advance(s, { ...idleInput(), throttle: 1 }, 4);
  assert.ok(s.contacts >= 1);
  assert.equal(collision(s), undefined);
  assert.ok(s.truck.z > 17);
});

test("rotated rectangle collision detects crossing edges even when no centre is inside", () => {
  assert.ok(
    overlap(
      { x: 0, z: 0, w: 1, d: 10, h: 0 },
      { x: 0, z: 0, w: 1, d: 10, h: Math.PI / 2 },
    ),
  );
  assert.equal(
    overlap(
      { x: 0, z: 0, w: 1, d: 10, h: 0 },
      { x: 20, z: 0, w: 1, d: 10, h: Math.PI / 2 },
    ),
    false,
  );
});

test("kiosk and gate cannot be skipped, wrong booking/PIN preserve progress", () => {
  const s = createState();
  assert.equal(interact(s), false);
  assert.equal(register(s, "PP-2048"), false);
  assert.equal(enterPin(s, "2048"), false);
  s.phase = "kiosk";
  assert.equal(register(s, "WRONG"), false);
  assert.equal(s.registered, false);
  assert.ok(register(s, "pp-2048"));
  assert.equal(s.phase, "walk-truck");
  s.phase = "pin";
  assert.equal(enterPin(s, "0000"), false);
  assert.equal(s.gateOpen, false);
  assert.ok(enterPin(s, "2048"));
  assert.equal(s.phase, "dock");
});

test("recovery restores the last safe checkpoint without clearing visit progress", () => {
  const s = createState();
  driveTo(s, { x: -24, z: 39 });
  interact(s);
  s.phase = "walk-truck";
  s.registered = true;
  s.driver.x = 40;
  recover(s);
  assert.equal(s.registered, true);
  assert.equal(s.recoveries, 1);
  assert.ok(Math.abs(s.driver.x - s.truck.x) < 3);
});

test("malformed controls are rejected before physics time advances", () => {
  const s = createState();
  for (const c of [
    { op: "input", seconds: -1 },
    { op: "input", seconds: Infinity },
    { op: "input", seconds: 121 },
    { op: "input", steer: 2 },
    { op: "input", brake: "no" },
    { op: "drive-to", x: "1", z: 2 },
  ])
    assert.throws(() => execute(s, c));
  assert.equal(s.elapsed, 0);
  assert.equal(s.truck.z, 62);
});

test("a paused interaction cannot advance simulation time", () => {
  const s = createState();
  s.phase = "kiosk";
  advance(s, { ...idleInput(), throttle: 1 }, 3);
  assert.equal(s.elapsed, 0);
  assert.equal(s.truck.z, 62);
});
