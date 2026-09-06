import test from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  createState,
  dispatch,
  docking,
  dockPoint,
  idleInput,
  objective,
  skipAhead,
} from "../src/game/simulation";
import { demo, execute, walkTo } from "../src/game/commands";
import {
  COPY,
  LOCATIONS,
  another,
  back,
  closeLocations,
  createFlow,
  fail,
  invalidReason,
  notify,
  openApp,
  openLocations,
  openVisitor,
  selectLocation,
  setSearch,
  succeed,
  toggleHideInvalid,
  validate,
  visibleLocations,
  visitorFor,
} from "../src/dispatch/flow";
import { smsLines } from "../src/sms";
import { ROUTES, dockRoute } from "../src/route";

test("call-off flow: notification, queue, details, location pick, confirmation", () => {
  const f = createFlow();
  assert.equal(f.screen, "home");
  assert.equal(openVisitor(f), false);
  assert.deepEqual(validate(f), { error: "Open the driver first." });
  assert.ok(notify(f));
  assert.equal(notify(f), false);
  assert.ok(openApp(f));
  assert.equal(f.screen, "queue");
  assert.equal(openApp(f), false);
  assert.equal(openLocations(f), false);
  assert.ok(openVisitor(f));
  assert.equal(f.screen, "visitor");
  assert.deepEqual(validate(f), { error: COPY.required });
  assert.equal(selectLocation(f, 2), false, "the picker must be open");
  assert.ok(openLocations(f));
  assert.deepEqual(
    visibleLocations(f).map((l) => l.id),
    [1, 2, 3, 4, 5],
  );
  setSearch(f, "3");
  assert.deepEqual(
    visibleLocations(f).map((l) => l.id),
    [3],
  );
  setSearch(f, "dock");
  toggleHideInvalid(f);
  assert.deepEqual(
    visibleLocations(f).map((l) => l.id),
    [1, 2, 3],
  );
  setSearch(f, "");
  assert.ok(selectLocation(f, 5));
  assert.deepEqual(validate(f), { error: COPY.locationOccupied });
  assert.ok(selectLocation(f, 4));
  assert.deepEqual(validate(f), { error: COPY.locationOutOfService });
  fail(f, "Could not dispatch visitor.");
  assert.equal(f.error, "Could not dispatch visitor.");
  assert.ok(selectLocation(f, 2));
  assert.equal(f.error, undefined, "a new pick clears the message");
  assert.deepEqual(validate(f), { dock: 2 });
  assert.equal(selectLocation(f, 2), false, "picking it again clears it");
  assert.equal(f.selected, undefined);
  assert.ok(selectLocation(f, 2));
  assert.ok(closeLocations(f));
  assert.equal(closeLocations(f), false);
  assert.equal(another(f), false);
  assert.ok(succeed(f, 2));
  assert.equal(f.screen, "success");
  assert.equal(f.dispatched, 2);
  assert.equal(back(f), false);
  assert.ok(another(f));
  assert.equal(f.screen, "done");
  assert.equal(openVisitor(f), false);
});

test("back from the details returns to the queue with the picker closed", () => {
  const f = createFlow();
  openApp(f);
  openVisitor(f);
  openLocations(f);
  setSearch(f, "dock 0");
  assert.ok(back(f));
  assert.equal(f.screen, "queue");
  assert.equal(f.sheetOpen, false);
  assert.equal(f.search, "");
  assert.equal(back(f), false);
});

test("locations mirror the yard's docks, tagged like the production app", () => {
  assert.deepEqual(
    LOCATIONS.map((l) => [l.name, invalidReason(l)]),
    [
      ["Dock 01", null],
      ["Dock 02", null],
      ["Dock 03", null],
      ["Dock 04", "OutOfService"],
      ["Dock 05", "Occupied"],
    ],
  );
  assert.equal(LOCATIONS[4].asset?.name, "1-KLM-482");
  const visitor = visitorFor("PP-K4M7Q2");
  assert.match(visitor.name, /PP-K4M7Q2/);
  assert.ok(
    visitor.fields.some((f) => f.kind === "plate" && f.value === "1-YRD-048"),
  );
});

test("the assigned dock drives the docking target, guide route, SMS and skip pose", () => {
  const s = createState();
  s.phase = "dispatch";
  s.registered = true;
  assert.ok(dispatch(s, 1));
  assert.deepEqual(dockPoint(s), { x: -36, z: -44 });
  assert.equal(objective({ ...s, phase: "dock" }).title, "Assigned dock: 01");
  assert.deepEqual(objective({ ...s, phase: "dock" }).target, {
    x: -36,
    z: -32.5,
  });
  assert.deepEqual(dockRoute(-36)[3], [-36, -24]);
  assert.deepEqual(ROUTES.dock, dockRoute(0));
  assert.match(smsLines(s.booking, s.pin, s.dock)[2], /dock 01\./);
  assert.ok(skipAhead(s));
  assert.equal(s.phase, "gate");
  assert.ok(skipAhead(s));
  assert.equal(s.phase, "dock");
  assert.equal(s.truck.x, -36);
  assert.ok(docking(s).ready);
  advance(s, idleInput(), 1);
  assert.equal(s.phase, "complete");
  assert.match(s.message, /dock 01/);
});

test("CLI: dispatch is a command, walking waits for it, the demo calls off to dock 03", () => {
  const s = createState();
  assert.throws(
    () => execute(s, { op: "dispatch", dock: 3 }),
    /Nobody is waiting/,
  );
  s.phase = "kiosk";
  execute(s, { op: "register", booking: s.booking });
  assert.throws(() => walkTo(s, { x: -28, z: 29 }), /assigning your dock/);
  assert.equal(s.phase, "dispatch");
  assert.throws(() => walkTo(s, { x: -28, z: 29 }), /assigning your dock/);
  assert.throws(() => execute(s, { op: "dispatch", dock: 5 }), /occupied/);
  assert.throws(() => execute(s, { op: "dispatch" }), /dock must be/);
  const result = execute(s, { op: "dispatch", dock: 2 });
  assert.equal(result.phase, "walk-truck");
  assert.equal(result.dock, 2);
  assert.equal(result.dispatched, true);
  assert.deepEqual(
    result.docks.map((d) => d.status),
    ["free", "free", "free", "outOfService", "occupied"],
  );
  walkTo(s, { x: -28, z: 29 });
  const d = createState();
  demo(d);
  assert.equal(d.dock, 3);
  assert.ok(d.events.some((e) => e.type === "dispatched"));
});
