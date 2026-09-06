import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  idleInput,
  advance,
  step,
  DT,
  interact,
  register,
  enterPin,
  recover,
  skipAhead,
} from "../src/game/simulation";
import { demo, driveTo, walkTo } from "../src/game/commands";
import { createRace, tickRace, formatTime } from "../src/game/race";
import {
  createLeaderboard,
  resultFromRace,
  sectionBoard,
  sectionSeconds,
  type Result,
} from "../src/game/leaderboard";

test("race waits for real movement, counts stops and recovery, resets with a new run", () => {
  const s = createState();
  advance(s, idleInput(), 5);
  advance(s, { ...idleInput(), steer: 1, brake: true }, 1);
  assert.deepEqual(s.race, createRace());
  step(s, { ...idleInput(), throttle: 1 });
  assert.equal(s.race.started, true);
  assert.equal(s.race.elapsed, DT);
  advance(s, { ...idleInput(), brake: true }, 2);
  assert.ok(s.race.elapsed > 2);
  const before = structuredClone(s.race);
  recover(s);
  assert.deepEqual(s.race, before);
  assert.deepEqual(createState().race, createRace());
});

test("kiosk and PIN entry count toward stage splits while truck physics is frozen", () => {
  const s = createState();
  driveTo(s, { x: -24, z: 39 });
  assert.ok(interact(s));
  const parkedAt = s.race.splits[0];
  walkTo(s, { x: -28, z: 29 });
  walkTo(s, { x: -33.7, z: 28.2 });
  assert.ok(interact(s));
  const physicsTime = s.elapsed;
  const raceTime = s.race.elapsed;
  advance(s, idleInput(), 3);
  assert.equal(s.elapsed, physicsTime);
  assert.ok(Math.abs(s.race.elapsed - raceTime - 3) < 1e-8);
  assert.equal(register(s, "bad"), false);
  assert.deepEqual(s.race.splits, [parkedAt]);
  assert.ok(register(s, s.booking));
  assert.equal(s.race.splits[1], s.race.elapsed);
  // The actual gate route and docking are covered by the full journey below.
  s.phase = "pin";
  const beforePin = s.race.elapsed;
  advance(s, idleInput(), 2);
  assert.equal(enterPin(s, "wrong"), false);
  assert.equal(s.race.splits.length, 2);
  assert.ok(enterPin(s, s.pin));
  assert.ok(Math.abs(s.race.splits[2] - beforePin - 2) < 1e-8);
});

test("full delivery records four ordered splits, freezes finish time, and yields a saveable result", async () => {
  const s = createState();
  demo(s);
  assert.equal(s.race.splits.length, 4);
  assert.ok(s.race.splits.every((n, i) => n > (s.race.splits[i - 1] ?? 0)));
  assert.equal(s.race.splits[3], s.race.elapsed);
  const finished = structuredClone(s.race);
  advance(s, idleInput(), 10);
  tickRace(s.race, 100);
  assert.deepEqual(s.race, finished);
  const board = createLeaderboard(storage);
  const result = resultFromRace(s.race, s);
  assert.equal(
    "truck" in result,
    false,
    "save only leaderboard data, not the whole simulation",
  );
  assert.ok((await board.save({ ...result, name: "Driver" })).persisted);
});

test("playtest shortcuts mark the run as practice and its clock still freezes at the dock", () => {
  const s = createState();
  step(s, { ...idleInput(), throttle: 1 });
  skipAhead(s);
  skipAhead(s);
  skipAhead(s);
  assert.equal(s.race.practice, true);
  advance(s, idleInput(), 1);
  assert.equal(s.phase, "complete");
  assert.equal(s.race.finished, true);
  const time = s.race.elapsed;
  tickRace(s.race, 100);
  assert.equal(s.race.elapsed, time);
});

test("browser clock counts uncapped real time without counting physics steps twice", () => {
  const s = createState();
  step(s, { ...idleInput(), throttle: 1 }, DT, false);
  assert.equal(s.race.elapsed, DT);
  tickRace(s.race, 65);
  step(s, idleInput(), DT, false);
  assert.equal(s.race.elapsed, 65 + DT);
  tickRace(s.race, -10);
  tickRace(s.race, Infinity);
  assert.equal(s.race.elapsed, 65 + DT);
});

test("race time formatting carries seconds and minutes correctly", () => {
  assert.equal(formatTime(0), "00:00.00");
  assert.equal(formatTime(59.999), "00:59.99");
  assert.equal(formatTime(60), "01:00.00");
  assert.equal(formatTime(3723.45), "62:03.45");
});

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
function result(id: string, seconds = 100): Result {
  return {
    id,
    seconds,
    name: "Driver",
    splits: [10, 20, 30, seconds],
    contacts: 0,
    recoveries: 0,
    assisted: true,
    date: "2026-09-06T10:00:00.000Z",
  };
}

test("leaderboard persists, ranks fastest first, normalizes names and saves each run once", async () => {
  const store = storage();
  const board = createLeaderboard(() => store);
  await board.save(result("slow", 120));
  assert.equal(
    (await board.save({ ...result("fast"), name: "  Truck   Hero  " })).rank,
    1,
  );
  await board.save({ ...result("fast"), name: "New name" });
  assert.deepEqual(
    board.list().map((r) => r.id),
    ["fast", "slow"],
  );
  assert.equal(board.list()[0].name, "New name");
  assert.deepEqual(createLeaderboard(() => store).list(), board.list());
  await assert.rejects(board.save({ ...result("empty"), name: "  " }));
});

test("bad storage data is ignored and valid entries survive", async () => {
  const store = storage();
  store.setItem(
    "peritruck-leaderboard-v1",
    JSON.stringify([
      null,
      {},
      result("ok"),
      { ...result("bad"), seconds: -1 },
      { ...result("split"), splits: [30, 20, 10, 100] },
    ]),
  );
  assert.deepEqual(
    createLeaderboard(() => store)
      .list()
      .map((r) => r.id),
    ["ok"],
  );
  store.setItem("peritruck-leaderboard-v1", "{bad json");
  const board = createLeaderboard(() => store);
  assert.deepEqual(board.list(), []);
  assert.ok((await board.save(result("fresh"))).persisted);
});

test("unavailable or full storage retains results for the current visit and reports failure", async () => {
  for (const getStorage of [
    () => {
      throw new Error("blocked");
    },
    () => ({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    }),
  ]) {
    const board = createLeaderboard(getStorage);
    assert.deepEqual(board.list(), []);
    assert.equal((await board.save(result("local"))).persisted, false);
    assert.equal(board.list()[0].id, "local");
  }
});

test("leaderboard retains the fastest 100 and reports a slower run's actual rank", async () => {
  const store = storage();
  const board = createLeaderboard(() => store);
  for (let i = 0; i < 100; i++) await board.save(result(String(i), 100 + i));
  assert.equal((await board.save(result("slowest", 300))).rank, 101);
  assert.equal(board.list().length, 100);
  assert.equal(board.list().at(-1)?.seconds, 199);
});

test("section boards rank each stage on its own, tie on date, and seat the unsaved run", () => {
  const rows = [
    { ...result("a", 90), splits: [10, 30, 40, 90] },
    { ...result("b", 95), splits: [5, 35, 45, 95] },
    {
      ...result("c", 100),
      splits: [10, 40, 50, 100],
      date: "2026-09-05T10:00:00.000Z",
    },
  ];
  assert.deepEqual(
    [0, 1, 2, 3].map((stage) => sectionSeconds(rows[0], stage)),
    [10, 20, 10, 50],
  );
  assert.equal(sectionSeconds({ splits: [10, 20] }, 2), undefined);
  assert.deepEqual(
    sectionBoard(rows, 0).map((e) => [e.rank, e.result.id, e.seconds]),
    [
      [1, "b", 5],
      [2, "c", 10],
      [3, "a", 10],
    ],
    "equal section times rank by the earlier run",
  );
  assert.deepEqual(
    sectionBoard(rows, 1).map((e) => e.result.id),
    ["a", "c", "b"],
  );
  const own = { ...result("own", 130), name: "", splits: [8, 60, 70, 130] };
  const parking = sectionBoard(rows, 0, own);
  assert.deepEqual(
    parking.map((e) => [e.rank, e.result.id]),
    [
      [1, "b"],
      [2, "own"],
      [3, "c"],
      [4, "a"],
    ],
    "an unsaved run joins every section board",
  );
  assert.equal(sectionBoard([...rows, own], 0, own).length, 4, "saved once");
  assert.equal(sectionBoard(rows, 3, own).at(-1)?.result.id, "own");
  assert.deepEqual(
    sectionBoard([{ ...own, splits: [8, 60] }], 2),
    [],
    "stages a run never reached stay off that section's board",
  );
});
