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
  distance,
  skipAhead,
  slowDown,
  prompt,
  YARD,
  type State,
  type Rect,
  obstacles,
  staticRigs,
  smsReceived,
  SMS_DELAY,
  DISPATCH_DELAY,
  dispatch,
  walking,
  objective,
  snapshot,
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
    [
      "parked",
      "registered",
      "dispatched",
      "entered-truck",
      "gate-opened",
      "completed",
    ],
  );
});

test("deterministic controls produce identical outcomes and replay split durations", () => {
  const a = createState(),
    b = createState();
  b.pin = a.pin; // the PIN is the only random part of a fresh session
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
  advance(s, idleInput(), 0.3);
  assert.equal(s.phase, "dock");
  advance(s, idleInput(), 0.3);
  assert.equal(s.phase, "complete");
  // Inside the loosened window: 1 m off centre, 8° skewed, 1.3 m from the bumper.
  const loose = createState();
  loose.phase = "dock";
  loose.truck = {
    ...s.truck,
    x: 1,
    z: -44 + 11.5 + 1.3,
    heading: 0.14,
    trailerHeading: 0.14,
  };
  assert.ok(docking(loose).ready);
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
  assert.equal(register(s, s.booking), false);
  assert.equal(enterPin(s, s.pin), false);
  s.phase = "kiosk";
  assert.equal(register(s, "WRONG"), false);
  assert.equal(s.registered, false);
  assert.ok(register(s, s.booking.toLowerCase()));
  assert.equal(s.phase, "walk-truck");
  s.phase = "pin";
  const wrongPin = s.pin === "0000" ? "1111" : "0000";
  assert.equal(enterPin(s, wrongPin), false);
  assert.equal(s.gateOpen, false);
  assert.ok(enterPin(s, s.pin));
  assert.equal(s.phase, "dock");
});

test("the yard operator is called shortly after leaving the kiosk; the gate PIN follows the call-off", () => {
  const s = createState();
  assert.equal(smsReceived(s), false);
  s.phase = "kiosk";
  assert.ok(register(s, s.booking));
  assert.equal(s.registered, true);
  assert.equal(s.dispatched, false);
  assert.equal(smsReceived(s), false);
  assert.equal(s.message, "");
  assert.match(objective(s).detail, /assigning your dock/);
  advance(s, idleInput(), DISPATCH_DELAY / 2);
  assert.equal(s.phase, "walk-truck");
  advance(s, idleInput(), DISPATCH_DELAY);
  assert.equal(s.phase, "dispatch");
  assert.equal(walking(s), true);
  const frozen = s.elapsed;
  advance(s, { ...idleInput(), walkX: 1 }, 2);
  assert.equal(s.elapsed, frozen, "the driver waits for the dock assignment");
  assert.equal(interact(s), false);
  assert.equal(dispatch(s, 5), false);
  assert.match(s.message, /Dock 05 is occupied/);
  assert.equal(dispatch(s, 4), false);
  assert.match(s.message, /out of service/);
  assert.equal(dispatch(s, 9), false);
  assert.equal(s.phase, "dispatch");
  assert.ok(dispatch(s, 2));
  assert.equal(s.phase, "walk-truck");
  assert.equal(s.dock, 2);
  assert.equal(smsReceived(s), false);
  assert.match(objective(s).detail, /on its way by SMS/);
  advance(s, idleInput(), SMS_DELAY / 2);
  assert.equal(smsReceived(s), false);
  advance(s, idleInput(), SMS_DELAY);
  assert.equal(smsReceived(s), true);
  assert.match(objective(s).detail, /arrived by SMS/);
  assert.equal(snapshot(s).smsReceived, true);
  assert.equal(snapshot(s).dock, 2);
  assert.equal(s.events.at(-1)?.type, "dispatched");
  assert.equal(dispatch(s, 2), false, "one call-off per visit");
  const skipped = createState();
  skipped.phase = "walk-truck";
  skipped.registered = true;
  skipped.smsAt = 99;
  skipAhead(skipped);
  assert.equal(smsReceived(skipped), true);
  assert.equal(skipped.dispatched, true);
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

test("hold-to-skip advances one act at a time: kiosk, gate line, dock", () => {
  const s = createState();
  assert.ok(skipAhead(s));
  assert.equal(s.phase, "walk-kiosk");
  assert.ok(parking(s).ready);
  assert.equal(prompt(s), "Check in at kiosk");
  assert.equal(s.registered, false);
  assert.ok(skipAhead(s));
  assert.equal(s.phase, "gate");
  assert.equal(s.registered, true);
  assert.equal(smsReceived(s), true);
  assert.equal(s.gateOpen, false);
  assert.equal(prompt(s), "Enter gate PIN");
  assert.equal(collision(s), undefined);
  assert.ok(skipAhead(s));
  assert.equal(s.phase, "dock");
  assert.equal(s.gateOpen, true);
  assert.ok(docking(s).ready);
  assert.equal(collision(s), undefined);
  advance(s, idleInput(), 1);
  assert.equal(s.phase, "complete");
  assert.equal(skipAhead(s), false);
});

test("skipping from the road or on foot snaps to the gate line first", () => {
  const s = createState();
  s.phase = "walk-truck";
  s.registered = true;
  assert.ok(skipAhead(s));
  assert.equal(s.phase, "gate");
  assert.ok(distance(s.truck, YARD.gate) < 6);
  s.truck.z = 45;
  assert.equal(prompt(s), "");
  assert.ok(skipAhead(s));
  assert.equal(s.phase, "gate");
  assert.equal(prompt(s), "Enter gate PIN");
  assert.ok(skipAhead(s));
  assert.equal(s.phase, "dock");
  assert.ok(s.truck.z < YARD.gateZ);
});

test("every session draws a fresh four-digit PIN and keeps the six-character booking", () => {
  const pins = new Set(Array.from({ length: 50 }, () => createState().pin));
  for (const pin of pins) assert.match(pin, /^\d{4}$/);
  assert.ok(pins.size > 1);
  const s = createState();
  assert.equal(s.booking, "PP-K4M7Q2");
  assert.equal(s.booking.slice(s.booking.indexOf("-") + 1).length, 6);
});

// Original SAT arithmetic, kept independent from production corners/overlap helpers.
function originalOverlap(a: Rect, b: Rect): boolean {
  const forward = (h: number) => ({ x: Math.sin(h), z: Math.cos(h) });
  const corners = (r: Rect) => {
    const f = forward(r.h),
      side = { x: Math.cos(r.h), z: -Math.sin(r.h) };
    return [-1, 1].flatMap((a) =>
      [-1, 1].map((b) => ({
        x: r.x + (f.x * r.d * a) / 2 + (side.x * r.w * b) / 2,
        z: r.z + (f.z * r.d * a) / 2 + (side.z * r.w * b) / 2,
      })),
    );
  };
  const ac = corners(a),
    bc = corners(b);
  return [
    forward(a.h),
    forward(a.h + Math.PI / 2),
    forward(b.h),
    forward(b.h + Math.PI / 2),
  ].every((axis) => {
    const ap = ac.map((p) => p.x * axis.x + p.z * axis.z),
      bp = bc.map((p) => p.x * axis.x + p.z * axis.z);
    return (
      Math.max(...ap) > Math.min(...bp) + 0.005 &&
      Math.max(...bp) > Math.min(...ap) + 0.005
    );
  });
}

function seededRandom() {
  let seed = 0xa11ce;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

test("prepared overlap matches original SAT across random, rotated and grazing rectangles", () => {
  const random = seededRandom();
  for (let i = 0; i < 6000; i++) {
    const a = {
      x: random() * 100 - 50,
      z: random() * 130 - 50,
      w: 0.1 + random() * 12,
      d: 0.1 + random() * 25,
      h: random() * Math.PI * 2,
    };
    const b = {
      x: a.x + random() * 30 - 15,
      z: a.z + random() * 30 - 15,
      w: 0.1 + random() * 12,
      d: 0.1 + random() * 25,
      h: random() * Math.PI * 2,
    };
    assert.equal(overlap(a, b), originalOverlap(a, b), `random ${i}`);
    assert.equal(overlap(b, a), originalOverlap(b, a), `reverse ${i}`);
  }
  for (const heading of [0, 1e-12, Math.PI / 4, Math.PI / 2, Math.PI, 2.37]) {
    for (const depth of [0, 0.004999999, 0.005, 0.005000001, 0.01]) {
      const a = { x: 0, z: 0, w: 2, d: 5, h: heading };
      const b = {
        ...a,
        x: Math.cos(heading) * (2 - depth),
        z: -Math.sin(heading) * (2 - depth),
      };
      assert.equal(overlap(a, b), originalOverlap(a, b), `${heading}/${depth}`);
    }
  }
  assert.equal(
    overlap(
      { x: 0, z: 0, w: 2, d: 2, h: 0 },
      { x: 1.995, z: 0, w: 2, d: 2, h: 0 },
    ),
    false,
  );
  assert.equal(
    overlap(
      { x: 0, z: 0, w: 2, d: 2, h: 0 },
      { x: 1.994999, z: 0, w: 2, d: 2, h: 0 },
    ),
    true,
  );
});

test("cached obstacles preserve first collision and walking outcomes for both gate states", () => {
  const random = seededRandom();
  for (let i = 0; i < 3000; i++) {
    const state = createState();
    state.gateOpen = i % 2 === 0;
    state.phase = "walk-kiosk";
    Object.assign(state.truck, {
      x: random() * 116 - 58,
      z: random() * 145 - 60,
      heading: random() * Math.PI * 2,
      trailerHeading: random() * Math.PI * 2,
    });
    const rects = rigRects(state.truck),
      blocked = obstacles(state);
    assert.equal(
      collision(state),
      blocked.find((o) => rects.some((r) => originalOverlap(r, o)))?.name,
    );
    state.driver = { x: random() * 110 - 55, z: random() * 140 - 57 };
    const input = {
      ...idleInput(),
      walkX: random() * 2 - 1,
      walkZ: random() * 2 - 1,
    };
    const len = Math.max(1, Math.hypot(input.walkX, input.walkZ));
    const next = {
      x: state.driver.x + (input.walkX / len) * 3 * DT,
      z: state.driver.z + (input.walkZ / len) * 3 * DT,
    };
    const walker = { ...next, w: 0.55, d: 0.55, h: 0 };
    const expected = blocked
      .filter((o) => o.name !== "Protected footpath")
      .concat(rects)
      .some((o) => originalOverlap(walker, o))
      ? { ...state.driver }
      : next;
    step(state, input);
    assert.deepEqual(state.driver, expected, `walking ${i}`);
  }
  const state = createState();
  state.phase = "walk-kiosk";
  state.driver = { x: -32.5, z: 39 };
  step(state, { ...idleInput(), walkZ: 1 });
  assert.ok(state.driver.z > 39, "protected path stays walkable");
  state.driver = { x: 18, z: 12.5 };
  step(state, { ...idleInput(), walkZ: -1 });
  assert.equal(state.driver.z, 12.5, "closed gate blocks walker");
  state.gateOpen = true;
  step(state, { ...idleInput(), walkZ: -1 });
  assert.ok(state.driver.z < 12.5, "opening gate permits walker");
});

test("obstacle copies cannot poison caches and mutable parked rigs invalidate prepared shapes", () => {
  const state = createState();
  state.gateOpen = true;
  state.truck = {
    x: 0,
    z: 0,
    heading: 0,
    trailerHeading: 0,
    speed: 0,
    steer: 0,
  };
  const initial = obstacles(state);
  const exposed = obstacles(state);
  exposed[0].x = 10000;
  exposed[0].name = "changed";
  exposed.pop();
  assert.deepEqual(obstacles(state), initial);
  const original = staticRigs.map((t) => ({ ...t }));
  try {
    Object.assign(staticRigs[0], state.truck);
    assert.equal(collision(state), "Parked truck");
    for (const key of ["x", "z", "heading", "trailerHeading"] as const) {
      staticRigs[0][key] += 0.8;
      const parked = obstacles(state).filter((o) => o.name === "Parked truck");
      assert.deepEqual(
        parked.slice(0, 2),
        rigRects(staticRigs[0]).map((r) => ({ ...r, name: "Parked truck" })),
      );
      assert.equal(
        collision(state),
        obstacles(state).find((o) =>
          rigRects(state.truck).some((r) => originalOverlap(r, o)),
        )?.name,
      );
    }
    staticRigs.splice(0, 1);
    assert.equal(collision(state), undefined);
    staticRigs.push({ ...state.truck });
    assert.equal(collision(state), "Parked truck");
    staticRigs.pop();
    assert.equal(collision(state), undefined);
  } finally {
    staticRigs.splice(0, staticRigs.length, ...original);
  }
  assert.deepEqual(obstacles(state), initial);
});
