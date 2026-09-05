// Run against npm run dev -- --port 5187. No profiling hooks ship in the app.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";

const label = process.argv[2] ?? "profile";
const out = path.resolve("artifacts/performance");
await mkdir(out, { recursive: true });
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : "playwright"
);
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.route("**/__performance_fixture", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<html><body style="margin:0"><div id="fixture" style="width:1280px;height:800px"></div></body></html>',
  }),
);
await page.goto(
  `${process.env.PROFILE_URL ?? "http://127.0.0.1:5187"}/__performance_fixture`,
);
await page.evaluate(async () => {
  const { YardScene } = await import("/src/scene.ts");
  const sim = await import("/src/game/simulation.ts");
  const view = new YardScene(document.getElementById("fixture"));
  await view.load();
  view.reducedMotion = true;
  view.mode = "yard";
  window.profile = { view, sim };
});
const result = {
  label,
  timestamp: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  sourceHash: createHash("sha256")
    .update(await readFile("src/scene.ts"))
    .update(await readFile("src/game/simulation.ts"))
    .update(await readFile("src/prediction.ts").catch(() => ""))
    .digest("hex"),
  environment: {
    browser: browser.version(),
    platform: os.platform(),
    arch: os.arch(),
    cpu: os.cpus()[0].model,
    viewport: [1280, 800],
    dpr: 1,
  },
  method:
    "Synchronous YardScene.render CPU submission, GPU finish outside timed region; warmup 30 frames then 5 batches x 30 frames. Fixed states, reducedMotion, yard camera, loaded assets. Not GPU time or FPS.",
  scenarios: {},
};
for (const phase of [
  "arrive",
  "gate",
  "pin",
  "walk-kiosk",
  "kiosk",
  "walk-truck",
  "dock",
  "complete",
]) {
  result.scenarios[phase] = await page.evaluate(async (phase) => {
    const { view, sim } = window.profile;
    const state = sim.createState();
    state.phase = phase;
    const input = sim.idleInput();
    const gl = view.renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    const draw = () => view.render(state, input, sim.DT, true);
    for (let n = 0; n < 30; n++) {
      draw();
      gl.finish();
    }
    const batches = [];
    for (let batch = 0; batch < 5; batch++) {
      const samples = [];
      for (let n = 0; n < 30; n++) {
        const t = performance.now();
        draw();
        samples.push(performance.now() - t);
        gl.finish();
      }
      batches.push(samples);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const sorted = batches.flat().sort((a, b) => a - b);
    // Private TS fields are inspected only here, in the development fixture.
    const dots = [];
    for (const child of view.route.children) {
      if (child.isInstancedMesh) {
        const arr = child.instanceMatrix.array;
        for (let i = 0; i < child.count; i++)
          dots.push(Array.from(arr.slice(i * 16, i * 16 + 16)));
      } else {
        child.updateMatrix();
        dots.push(Array.from(new Float32Array(child.matrix.elements)));
      }
    }
    return {
      gpu,
      batches,
      batchMedians: batches.map(
        (b) => [...b].sort((a, b) => a - b)[Math.floor(b.length / 2)],
      ),
      medianMs: sorted[Math.floor(sorted.length / 2)],
      p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      render: { ...view.renderer.info.render },
      memory: { ...view.renderer.info.memory },
      routeObjects: view.route.children.length,
      routeDots: dots.length,
      matrices: dots,
    };
  }, phase);
  if (["gate", "walk-kiosk", "dock"].includes(phase))
    await page.screenshot({ path: path.join(out, `${label}-${phase}.png`) });
  console.log(
    phase,
    JSON.stringify({
      medianMs: result.scenarios[phase].medianMs,
      p95Ms: result.scenarios[phase].p95Ms,
      calls: result.scenarios[phase].render.calls,
      dots: result.scenarios[phase].routeDots,
    }),
  );
}
result.predictionScenarios = {};
for (const moving of [false, true]) {
  const name = moving ? "moving" : "stationary";
  result.predictionScenarios[name] = await page.evaluate(async (moving) => {
    const { view, sim } = window.profile;
    const state = sim.createState();
    state.phase = "gate";
    const input = {
      ...sim.idleInput(),
      throttle: moving ? 0.5 : 0,
      steer: moving ? 0.2 : 0,
    };
    const gl = view.renderer.getContext();
    const draw = () => {
      // Deterministic changing poses outside the measured render interval.
      if (moving) sim.integrate(state.truck, input, state.assisted, sim.DT);
      const t = performance.now();
      view.render(state, input, sim.DT, true);
      return performance.now() - t;
    };
    for (let n = 0; n < 30; n++) {
      draw();
      gl.finish();
    }
    const batches = [];
    let geometryReplacements = 0,
      attributeRefreshes = 0;
    let geometry = view.prediction.geometry;
    let attribute = geometry.getAttribute("position");
    let version = attribute.version;
    for (let batch = 0; batch < 5; batch++) {
      const samples = [];
      for (let n = 0; n < 30; n++) {
        samples.push(draw());
        const nextGeometry = view.prediction.geometry;
        const nextAttribute = nextGeometry.getAttribute("position");
        if (nextGeometry !== geometry) geometryReplacements++;
        if (nextAttribute !== attribute || nextAttribute.version !== version)
          attributeRefreshes++;
        geometry = nextGeometry;
        attribute = nextAttribute;
        version = attribute.version;
        gl.finish();
      }
      batches.push(samples);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const sorted = batches.flat().sort((a, b) => a - b);
    return {
      batches,
      batchMedians: batches.map((b) => [...b].sort((a, b) => a - b)[15]),
      medianMs: sorted[75],
      p95Ms: sorted[142],
      geometryReplacements,
      attributeRefreshes,
      finalPositions: Array.from(attribute.array),
      truck: state.truck,
      input,
    };
  }, moving);
  console.log(
    "prediction-" + name,
    JSON.stringify(result.predictionScenarios[name]),
  );
}
result.phaseCycles = await page.evaluate(() => {
  const { view, sim } = window.profile;
  const state = sim.createState();
  const input = sim.idleInput();
  const memory = [];
  for (let cycle = 0; cycle < 10; cycle++) {
    for (const phase of ["gate", "pin", "walk-kiosk", "dock", "complete"]) {
      state.phase = phase;
      view.render(state, input, sim.DT, true);
    }
    memory.push({ ...view.renderer.info.memory });
  }
  return memory;
});
result.errors = errors;
await writeFile(
  path.join(out, `${label}.json`),
  JSON.stringify(result, null, 2) + "\n",
);
await browser.close();
if (errors.length) throw Error(errors.join("\n"));
