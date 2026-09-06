import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { createState, type State } from "../src/game/simulation";

type Call = { event: string; props: Record<string, unknown> };

/** Load analytics.ts with a fake Amplitude SDK and a production-like environment. */
function load(env: Record<string, unknown> = { PROD: true }) {
  const calls: Call[] = [];
  const identities: Record<string, unknown>[] = [];
  class Identify {
    props: Record<string, unknown> = {};
    set(key: string, value: unknown) {
      this.props[key] = value;
      return this;
    }
    add(key: string, value: number) {
      this.props[key] = { $add: value };
      return this;
    }
  }
  const amplitude = {
    init() {},
    track(event: string, props: Record<string, unknown>) {
      calls.push({ event, props });
    },
    identify(id: Identify) {
      identities.push(id.props);
    },
    Identify,
  };
  const require = createRequire(
    new URL("../src/analytics.ts", import.meta.url),
  );
  const context = createContext({
    navigator: { webdriver: false },
    exports: {},
    importMeta: { env },
    require: (id: string) =>
      id === "@amplitude/analytics-browser" ? amplitude : require(id),
  });
  const source = readFileSync(
    new URL("../src/analytics.ts", import.meta.url),
    "utf8",
  );
  runInContext(
    ts.transpileModule(source.replaceAll("import.meta", "importMeta"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    context,
  );
  const api = context.exports as typeof import("../src/analytics");
  return { api, calls, identities, events: () => calls.map((c) => c.event) };
}

function finish(s: State, splits = [20, 45, 60, 90.5]) {
  s.race.started = true;
  s.race.splits = splits;
  s.race.elapsed = splits.at(-1)!;
  s.race.finished = true;
  s.phase = "complete";
}

test("race start, stage progress and completion carry wall-clock race data", () => {
  const { api, calls, identities, events } = load();
  const s = createState();
  api.observe(s);
  assert.deepEqual(events(), ["demo_started"]);
  assert.equal(calls[0].props.replay, false);

  // Idle frames before the truck moves add nothing.
  api.observe(s);
  s.elapsed = 3;
  api.observe(s);
  assert.deepEqual(events(), ["demo_started"]);

  s.race.started = true;
  s.race.elapsed = 0.02;
  api.observe(s);
  api.observe(s);
  assert.deepEqual(events(), ["demo_started", "race_started"]);
  assert.equal(calls[1].props.race_started, true);
  assert.equal(calls[1].props.stage, 0);

  s.phase = "walk-kiosk";
  s.race.splits = [20];
  s.race.elapsed = 21.44;
  s.elapsed = 25;
  api.observe(s);
  const reached = calls.at(-1)!;
  assert.equal(reached.event, "phase_reached");
  assert.equal(reached.props.from, "arrive");
  assert.equal(reached.props.phase_s, 25);
  assert.equal(reached.props.race_s, 21.4);
  assert.equal(reached.props.stage, 1);
  assert.equal(reached.props.practice, false);

  finish(s);
  api.observe(s);
  const done = calls.at(-1)!;
  assert.equal(done.event, "demo_completed");
  assert.equal(done.props.eligible, true);
  assert.equal(done.props.race_s, 90.5);
  assert.equal(done.props.split_parking_s, 20);
  assert.equal(done.props.split_kiosk_s, 25);
  assert.equal(done.props.split_gate_s, 15);
  assert.equal(done.props.split_dock_s, 30.5);
  assert.deepEqual(identities, [
    { runs_completed: { $add: 1 }, last_run_s: 90.5 },
  ]);
});

test("skipped stages complete as practice and never count as finished runs", () => {
  const { api, calls, identities } = load();
  const s = createState();
  api.observe(s);
  s.race.practice = true;
  finish(s, [90.5]);
  api.observe(s);
  const done = calls.at(-1)!;
  assert.equal(done.event, "demo_completed");
  assert.equal(done.props.practice, true);
  assert.equal(done.props.eligible, false);
  assert.equal(done.props.split_parking_s, 90.5);
  assert.equal("split_kiosk_s" in done.props, false);
  assert.deepEqual(identities, []);
});

test("a new state mid-run is a restart; after completion it is a replay", () => {
  const { api, calls, events } = load();
  let s = createState();
  api.observe(s);
  s.race.started = true;
  api.observe(s);
  s = createState();
  api.observe(s);
  assert.deepEqual(events(), [
    "demo_started",
    "race_started",
    "demo_restarted",
    "demo_started",
  ]);
  assert.equal(calls[2].props.race_started, true);
  assert.equal(calls[3].props.replay, true);
  assert.equal(calls[3].props.after_complete, false);

  // The race flag follows the new state, so its first movement is tracked again.
  s.race.started = true;
  api.observe(s);
  assert.equal(events().at(-1), "race_started");

  finish(s);
  api.observe(s);
  s = createState();
  api.observe(s);
  assert.equal(events().filter((e) => e === "demo_restarted").length, 1);
  assert.equal(calls.at(-1)!.props.after_complete, true);
});

test("actions merge extra props and saved runs identify the local best", () => {
  const { api, calls, identities } = load();
  const s = createState();
  finish(s);
  api.trackAction("score_saved", s, { rank: 2, persisted: true, best: false });
  assert.equal(calls.at(-1)!.props.rank, 2);
  assert.equal(calls.at(-1)!.props.race_s, 90.5);
  api.identifyBest(61.234);
  assert.deepEqual(identities, [{ local_best_s: 61.2 }]);
  api.trackAction("leaderboard_opened", s, { started: false });
  assert.equal(calls.at(-1)!.props.started, false);
});

test("CLI-driven and non-production sessions stay silent", () => {
  const cli = load();
  cli.api.setControls("cli");
  const s = createState();
  cli.api.observe(s);
  cli.api.identifyBest(10);
  cli.api.trackAction("skip_used", s);
  assert.deepEqual(cli.calls, []);
  assert.deepEqual(cli.identities, []);

  const dev = load({ PROD: false });
  dev.api.observe(createState());
  assert.deepEqual(dev.calls, []);
});
