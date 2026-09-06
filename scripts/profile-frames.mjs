/** Frame pacing of the real app, driven through its own keyboard controls.
 * Complements profile-performance.mjs, which times an isolated scene fixture.
 *
 * Run against `npm run dev`, then: node scripts/profile-frames.mjs <label> [url]
 * HEADED=1 opens a visible window so frames follow the display's refresh rate
 * (headless Chrome paces at 60 Hz). DPR sets the device scale factor (default 2).
 * PLAYWRIGHT_MODULE points at a Playwright install outside this project.
 *
 * Per scenario: rAF interval percentiles, JS time inside the frame callback,
 * time from callback end to the next task (style, layout, paint, commit),
 * how many fixed steps the app's accumulator would run per frame, WebGL draw
 * calls per frame, HUD text writes and minimap draws per UI tick, and the
 * continuity of the rendered pose: the share of frames that show no movement
 * while the actor is under way ("frozen") or move more than 1.75x the mean
 * rendered speed of the surrounding quarter second ("double").
 * The driving window is also traced and CPU-profiled for attribution.
 * Results land in artifacts/performance/<label>.json. */
import { pathToFileURL } from "node:url";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const label = process.argv[2] ?? "frames";
const url = process.argv[3] ?? "http://127.0.0.1:5173/";
const out = path.resolve("artifacts/performance");
await mkdir(out, { recursive: true });
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : "playwright"
);
const browser = await chromium.launch({
  headless: !process.env.HEADED,
  channel: "chrome",
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: Number(process.env.DPR ?? 2),
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url);
await page.waitForSelector("#start:not([disabled])", { timeout: 60000 });

await page.evaluate(async () => {
  const W = window;
  // Record the pose handed to the renderer each frame: the app draws through
  // this prototype method, so this sees exactly what is displayed.
  // Vite appends ?t= to modules edited while the server ran; import the exact
  // URL the app loaded so the patch lands on the live class.
  const sceneUrl =
    performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .find((n) => /\/src\/scene\.ts(\?|$)/.test(n)) ?? "/src/scene.ts";
  const { YardScene } = await import(sceneUrl);
  const origRender = YardScene.prototype.render;
  YardScene.prototype.render = function (s, ...rest) {
    if (W.__perf?.on)
      W.__perf.pose.push([s.truck.x, s.truck.z, s.driver.x, s.driver.z]);
    return origRender.call(this, s, ...rest);
  };
  const origRAF = W.requestAnimationFrame.bind(W);
  const ch = new MessageChannel();
  const rec = {
    on: false,
    ts: [],
    js: [],
    post: [],
    text: [],
    canvas: [],
    pendingEnd: 0,
    textSets: 0,
    canvasOps: 0,
    draws: 0,
    drawList: [],
    pose: [],
  };
  for (const proto of [
    WebGL2RenderingContext.prototype,
    WebGLRenderingContext.prototype,
  ]) {
    for (const m of [
      "drawElements",
      "drawArrays",
      "drawElementsInstanced",
      "drawArraysInstanced",
    ]) {
      const orig = proto[m];
      if (!orig) continue;
      proto[m] = function (...a) {
        rec.draws++;
        return orig.apply(this, a);
      };
    }
  }
  ch.port1.onmessage = () => {
    if (rec.on && rec.pendingEnd) {
      rec.post.push(performance.now() - rec.pendingEnd);
      rec.pendingEnd = 0;
    }
  };
  W.__perf = rec;
  W.requestAnimationFrame = (cb) =>
    origRAF((ts) => {
      rec.textSets = 0;
      rec.canvasOps = 0;
      rec.draws = 0;
      const t0 = performance.now();
      cb(ts);
      const t1 = performance.now();
      if (rec.on) {
        rec.ts.push(ts);
        rec.js.push(t1 - t0);
        rec.text.push(rec.textSets);
        rec.canvas.push(rec.canvasOps);
        rec.drawList.push(rec.draws);
        rec.pendingEnd = t1;
        ch.port2.postMessage(0);
      }
    });
  const desc = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
  Object.defineProperty(Node.prototype, "textContent", {
    ...desc,
    set(v) {
      rec.textSets++;
      return desc.set.call(this, v);
    },
  });
  for (const m of ["fillRect", "fill", "stroke", "clearRect"]) {
    const orig = CanvasRenderingContext2D.prototype[m];
    CanvasRenderingContext2D.prototype[m] = function (...a) {
      rec.canvasOps++;
      return orig.apply(this, a);
    };
  }
  W.__perfRun = (ms) =>
    new Promise((res) => {
      rec.ts = [];
      rec.js = [];
      rec.post = [];
      rec.text = [];
      rec.canvas = [];
      rec.drawList = [];
      rec.pose = [];
      rec.on = true;
      setTimeout(() => {
        rec.on = false;
        const d = rec.ts.slice(1).map((t, i) => t - rec.ts[i]);
        const sorted = [...d].sort((a, b) => a - b);
        const q = (arr, p) => {
          const s = [...arr].sort((a, b) => a - b);
          return s[Math.min(s.length - 1, Math.floor(s.length * p))];
        };
        let acc = 0;
        const steps = { 0: 0, 1: 0, 2: 0, "3+": 0 };
        for (const dd of d) {
          acc += Math.min(dd / 1000, 0.05);
          let n = 0;
          while (acc >= 1 / 60) {
            acc -= 1 / 60;
            n++;
          }
          steps[n >= 3 ? "3+" : n]++;
        }
        // Correlate: JS time on frames that wrote text (UI tick) vs frames that did not.
        const uiFrames = rec.js.filter((_, i) => rec.text[i] > 0);
        const quietFrames = rec.js.filter((_, i) => rec.text[i] === 0);
        const uiPost = rec.post.filter((_, i) => rec.text[i] > 0);
        const quietPost = rec.post.filter((_, i) => rec.text[i] === 0);
        // Rendered motion continuity. Displacement per frame is normalised by
        // the frame interval and compared with the mean rendered speed over a
        // centred 0.25 s window. A "frozen" frame shows no movement while the
        // actor is under way; a "double" frame moves more than 1.75x the mean.
        const moves = rec.pose.slice(1).map((p, i) => {
          const q = rec.pose[i];
          return Math.max(
            Math.hypot(p[0] - q[0], p[1] - q[1]),
            Math.hypot(p[2] - q[2], p[3] - q[3]),
          );
        });
        const speed = moves.map((m, i) => (m / Math.max(d[i] ?? 16, 1)) * 1000);
        const seconds = (rec.ts.at(-1) - rec.ts[0]) / 1000;
        const half = Math.max(4, Math.round(speed.length / seconds / 8));
        let frozen = 0,
          doubles = 0,
          judged = 0;
        for (let i = half; i < speed.length - half; i++) {
          const window = speed.slice(i - half, i + half + 1);
          const mean = window.reduce((a, b) => a + b, 0) / window.length;
          if (mean < 0.5) continue;
          judged++;
          if (moves[i] < 1e-6) frozen++;
          if (speed[i] > mean * 1.75) doubles++;
        }
        res({
          motion: {
            judged,
            frozen,
            doubles,
            frozenShare: judged ? frozen / judged : 0,
            doubleShare: judged ? doubles / judged : 0,
          },
          frames: d.length,
          fps: (d.length / (rec.ts.at(-1) - rec.ts[0])) * 1000,
          dt: {
            median: q(d, 0.5),
            p95: q(d, 0.95),
            p99: q(d, 0.99),
            max: sorted.at(-1),
          },
          over20: d.filter((x) => x > 20).length,
          over25: d.filter((x) => x > 25).length,
          over33: d.filter((x) => x > 33).length,
          js: {
            median: q(rec.js, 0.5),
            p95: q(rec.js, 0.95),
            max: q(rec.js, 1),
          },
          post: {
            median: q(rec.post, 0.5),
            p95: q(rec.post, 0.95),
            max: q(rec.post, 1),
          },
          uiTickFrames: uiFrames.length,
          jsUiTick: { median: q(uiFrames, 0.5), p95: q(uiFrames, 0.95) },
          jsQuiet: { median: q(quietFrames, 0.5), p95: q(quietFrames, 0.95) },
          postUiTick: { median: q(uiPost, 0.5), p95: q(uiPost, 0.95) },
          postQuiet: { median: q(quietPost, 0.5), p95: q(quietPost, 0.95) },
          textSetsPerTick:
            q(
              rec.text.filter((x) => x > 0),
              0.5,
            ) ?? 0,
          canvasOpsPerTick:
            q(
              rec.canvas.filter((x) => x > 0),
              0.5,
            ) ?? 0,
          stepsPerFrame: steps,
          drawCalls: q(rec.drawList, 0.5),
          hidden: document.hidden,
          dpr: devicePixelRatio,
          size: [innerWidth, innerHeight],
        });
      }, ms);
    });
});

const result = { label, url, scenarios: {} };
const run = async (name, ms = 3000) => {
  result.scenarios[name] = await page.evaluate(
    (ms) => window.__perfRun(ms),
    ms,
  );
  const s = result.scenarios[name];
  console.log(
    name.padEnd(18),
    JSON.stringify({
      fps: +s.fps.toFixed(1),
      dtP95: +s.dt.p95.toFixed(2),
      dtMax: +s.dt.max.toFixed(1),
      over20: s.over20,
      js: [s.js.median, s.js.p95, s.js.max].map((x) => +x.toFixed(2)),
      post: [s.post.median, s.post.p95, s.post.max].map((x) => +x.toFixed(2)),
      jsUi: [s.jsUiTick.median, s.jsUiTick.p95].map(
        (x) => +(x ?? 0).toFixed(2),
      ),
      jsQuiet: [s.jsQuiet.median, s.jsQuiet.p95].map(
        (x) => +(x ?? 0).toFixed(2),
      ),
      postUi: [s.postUiTick.median, s.postUiTick.p95].map(
        (x) => +(x ?? 0).toFixed(2),
      ),
      postQuiet: [s.postQuiet.median, s.postQuiet.p95].map(
        (x) => +(x ?? 0).toFixed(2),
      ),
      steps: s.stepsPerFrame,
      motion: [
        s.motion.judged,
        +(s.motion.frozenShare * 100).toFixed(1) + "% frozen",
        +(s.motion.doubleShare * 100).toFixed(1) + "% double",
      ],
      draws: s.drawCalls,
      textSets: s.textSetsPerTick,
      canvasOps: s.canvasOpsPerTick,
    }),
  );
};

// Let first-use uploads (geometry, shadow map) settle before sampling the intro view.
await page.waitForTimeout(1500);
await run("intro-idle", 3000);
await page.click("#start");
await page.waitForTimeout(600);
await run("game-idle", 3000);

// Trace the driving scenario for main-thread attribution.
const tracePath = path.join(out, `${label}-trace.json`);
await browser.startTracing(page, {
  path: tracePath,
  screenshots: false,
  categories: [
    "devtools.timeline",
    "disabled-by-default-devtools.timeline",
    "disabled-by-default-devtools.timeline.frame",
    "v8.execute",
    "disabled-by-default-v8.gc",
  ],
});
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
await cdp.send("Profiler.start");
await page.keyboard.down("w");
await run("drive-forward", 4000);
await page.keyboard.down("a");
await run("drive-steer", 3000);
await page.keyboard.up("a");
await page.keyboard.up("w");
const { profile } = await cdp.send("Profiler.stop");
await browser.stopTracing();
{
  // Self time per function (top 30), plus inclusive time for a few known entry points.
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const total = profile.samples.length;
  const dtSum = profile.timeDeltas.reduce((a, b) => a + b, 0) / 1000;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = nodes.get(profile.samples[i]);
    const key = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").slice(-2).join("/")}:${n.callFrame.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
  }
  const parent = new Map();
  for (const n of profile.nodes)
    for (const c of n.children ?? []) parent.set(c, n.id);
  const inclusive = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    let id = profile.samples[i];
    const seen = new Set();
    while (id !== undefined) {
      const n = nodes.get(id);
      const key = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").slice(-1)[0]}`;
      if (!seen.has(key)) {
        seen.add(key);
        inclusive.set(
          key,
          (inclusive.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000,
        );
      }
      id = parent.get(id);
    }
  }
  result.profile = {
    seconds: +(dtSum / 1000).toFixed(2),
    selfTop: [...self.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([k, v]) => [k, +(v / (dtSum / 1000)).toFixed(2)]),
    inclusive: [...inclusive.entries()]
      .filter(([k]) =>
        /render|step|frame|updateUI|drawMap|predict|collision|projectObject|renderObjects|renderShadowMap|currentInput|placeTargetLabel|getGamepads|setProgram|uploadUniforms|Line|InstancedMesh|update|renderBufferDirect|setupLights/.test(
          k,
        ),
      )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([k, v]) => [k, +(v / (dtSum / 1000)).toFixed(2)]),
  };
  console.log("CPU profile self ms/s (top 30):");
  for (const row of result.profile.selfTop)
    console.log("  ", row[1].toFixed(2).padStart(7), row[0]);
  console.log("CPU profile inclusive ms/s (selected):");
  for (const row of result.profile.inclusive)
    console.log("  ", row[1].toFixed(2).padStart(7), row[0]);
}
await run("stopped-in-game", 2500);

// Playtest shortcut: hold X for a second → parked and standing at the kiosk path.
await page.keyboard.down("x");
await page.waitForTimeout(1300);
await page.keyboard.up("x");
await page.waitForTimeout(400);
await page.keyboard.down("ArrowUp");
await run("walking", 3000);
await page.keyboard.up("ArrowUp");
result.phase = await page.evaluate(
  () => document.getElementById("step-label")?.textContent,
);
result.errors = errors;

// Trace attribution: main-thread totals by event name during the traced window.
const trace = JSON.parse(await readFile(tracePath, "utf8"));
const events = trace.traceEvents ?? trace;
const threadNames = new Map();
for (const e of events)
  if (e.ph === "M" && e.name === "thread_name")
    threadNames.set(`${e.pid}:${e.tid}`, e.args.name);
const mainKeys = [...threadNames.entries()]
  .filter(([, n]) => n === "CrRendererMain")
  .map(([k]) => k);
const totals = {};
const counts = {};
let traceStart = Infinity,
  traceEnd = 0;
const tasks = [];
for (const e of events) {
  if (e.ph !== "X" || !mainKeys.includes(`${e.pid}:${e.tid}`)) continue;
  traceStart = Math.min(traceStart, e.ts);
  traceEnd = Math.max(traceEnd, e.ts + (e.dur ?? 0));
  totals[e.name] = (totals[e.name] ?? 0) + (e.dur ?? 0) / 1000;
  counts[e.name] = (counts[e.name] ?? 0) + 1;
  if (e.name === "RunTask") tasks.push((e.dur ?? 0) / 1000);
}
const seconds = (traceEnd - traceStart) / 1e6;
const top = Object.entries(totals)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 22)
  .map(([n, ms]) => [
    n,
    +(ms / seconds).toFixed(2),
    +(counts[n] / seconds).toFixed(1),
  ]);
tasks.sort((a, b) => a - b);
result.trace = {
  seconds: +seconds.toFixed(2),
  mainThreadMsPerSecond: top,
  runTask: {
    count: tasks.length,
    p50: tasks[Math.floor(tasks.length * 0.5)],
    p95: tasks[Math.floor(tasks.length * 0.95)],
    p99: tasks[Math.floor(tasks.length * 0.99)],
    max: tasks.at(-1),
    over16: tasks.filter((t) => t > 16).length,
  },
};
console.log("trace seconds", result.trace.seconds);
console.log("main thread ms/s by event (name, ms/s, count/s):");
for (const row of top) console.log("  ", row.join("\t"));
console.log("RunTask", JSON.stringify(result.trace.runTask));
console.log("phase:", result.phase, "errors:", errors);
await writeFile(
  path.join(out, `${label}.json`),
  JSON.stringify(result, null, 2),
);
await browser.close();
