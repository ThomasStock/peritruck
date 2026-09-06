import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";

// Run the real controls and simulation, without WebGL, telemetry or the kiosk's own UI.
async function game() {
  const dom = new JSDOM('<div id="app"></div>', {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const canvas = new Proxy({}, { get: () => () => {} });
  window.HTMLCanvasElement.prototype.getContext = (() => canvas) as never;
  const captures = new WeakMap<Element, number>();
  window.HTMLElement.prototype.setPointerCapture = function (id) {
    captures.set(this, id);
  };
  window.HTMLElement.prototype.hasPointerCapture = function (id) {
    return captures.get(this) === id;
  };
  window.HTMLElement.prototype.releasePointerCapture = function () {
    captures.delete(this);
  };
  const require = createRequire(new URL("../src/main.ts", import.meta.url));
  const sentFeedback: unknown[] = [];
  const context = createContext({
    window,
    document: window.document,
    navigator: window.navigator,
    Element: window.Element,
    localStorage: window.localStorage,
    matchMedia: () => ({ matches: false }),
    performance,
    requestAnimationFrame: () => 0,
    setTimeout,
    clearTimeout,
    AbortController,
    devicePixelRatio: 1,
    console,
    execute: require("./game/commands").execute,
    interact: require("./game/simulation").interact,
    skipAhead: require("./game/simulation").skipAhead,
    step: require("./game/simulation").step,
    exports: {},
    importMeta: {},
    require: (id: string) => {
      if (id.endsWith(".css")) return {};
      if (id === "./sentry") return {};
      if (id === "./feedback")
        return {
          sendFeedback(feedback: unknown) {
            sentFeedback.push(feedback);
            return Promise.resolve();
          },
        };
      if (id === "./leaderboard-convex") return {};
      if (id === "./analytics")
        return {
          identifyBest() {},
          initAnalytics() {},
          observe() {},
          setControls() {},
          trackAction() {},
        };
      if (id === "./kiosk/view")
        return { mountKiosk: () => ({ destroy() {} }) };
      if (id === "./dispatch/view")
        return {
          mountDispatch: () => ({
            flow: { screen: "home" },
            dismiss: () => Promise.resolve(),
            destroy() {},
          }),
        };
      if (id === "./scene")
        return {
          YardScene: class {
            loaded = true;
            mode = "follow";
            attention = "driver";
            cutting = false;
            operatorPhone = false;
            cutTo(target: string) {
              this.attention = target;
            }
            renderer = { domElement: window.document.createElement("canvas") };
            load() {
              return Promise.resolve();
            }
            render() {}
            project() {
              return { x: 0, y: 0, visible: false };
            }
          },
        };
      return require(id);
    },
  });
  const source = readFileSync(
    new URL("../src/main.ts", import.meta.url),
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
  await Promise.resolve();
  const run = (code: string) => runInContext(code, context);
  run("start(); updateUI()");
  return { dom, run, document: window.document, sentFeedback };
}

function pointer(element: Element, type: string, x: number, y: number, id = 1) {
  const event = new element.ownerDocument.defaultView!.Event(type, {
    bubbles: true,
    cancelable: true,
  });
  Object.assign(event, { clientX: x, clientY: y, pointerId: id, button: 0 });
  element.dispatchEvent(event);
}

function joystickGeometry(document: Document) {
  const joystick = document.getElementById("walk-joystick")!;
  joystick.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 112, height: 112 }) as DOMRect;
  Object.defineProperty(joystick.firstElementChild, "offsetWidth", {
    value: 48,
  });
  return joystick;
}

const stepOut =
  'execute(state, { op: "drive-to", x: -24, z: 39 }); interact(state); updateUI()';

test("stepping out replaces mobile driving controls with a walking joystick", async () => {
  const { dom, run, document } = await game();
  try {
    const controls = document.getElementById("touch-controls")!;
    assert.equal(controls.getAttribute("aria-label"), "Touch driving controls");
    run(stepOut);
    assert.equal(run("state.phase"), "walk-kiosk");
    assert.equal(controls.getAttribute("aria-label"), "Touch walking controls");
    assert.ok(document.getElementById("walk-joystick"));
    assert.ok(
      [...controls.querySelectorAll<HTMLElement>(".touch-group")].every(
        (el) => el.hidden,
      ),
    );
  } finally {
    dom.window.close();
  }
});

test("joystick moves the driver at analog speed, with a dead zone and bounded diagonals", async () => {
  const { dom, run, document } = await game();
  try {
    run(stepOut);
    const joystick = joystickGeometry(document);
    pointer(joystick, "pointerdown", 57, 56);
    assert.equal(
      run("Math.hypot(currentInput().walkX, currentInput().walkZ)"),
      0,
    );
    pointer(joystick, "pointermove", 72, 56);
    const half = run("Math.hypot(currentInput().walkX, currentInput().walkZ)");
    assert.ok(half > 0.3 && half < 0.6);
    pointer(joystick, "pointermove", 88, 56);
    assert.ok(
      run("currentInput().walkX > 0 && currentInput().walkZ < 0"),
      "right is screen-relative in follow view",
    );
    const before = run("({ ...state.driver })");
    run("step(state, currentInput())");
    assert.ok(run("state.driver.x") > before.x);
    assert.ok(run("state.driver.z") < before.z);
    pointer(joystick, "pointermove", 300, 300);
    assert.ok(
      run("Math.hypot(currentInput().walkX, currentInput().walkZ)") <= 1.003,
    );
    run('scene.mode = "overhead"');
    pointer(joystick, "pointermove", 56, 24);
    assert.equal(run("currentInput().walkX"), 0);
    assert.equal(run("currentInput().walkZ"), -1);
    pointer(joystick, "pointerdown", 88, 56, 2);
    pointer(joystick, "pointerup", 88, 56, 2);
    assert.equal(
      run("currentInput().walkZ"),
      -1,
      "a second finger cannot steal or release the joystick",
    );
  } finally {
    dom.window.close();
  }
});

for (const release of [
  "pointerup",
  "pointercancel",
  "lostpointercapture",
  "blur",
  "visibilitychange",
  "settings",
  "cli pause",
]) {
  test(`walking stops on ${release}`, async () => {
    const { dom, run, document } = await game();
    try {
      run(stepOut);
      const joystick = joystickGeometry(document);
      pointer(joystick, "pointerdown", 88, 56);
      assert.ok(run("currentInput().walkX > 0"));
      if (release === "blur")
        dom.window.dispatchEvent(new dom.window.Event("blur"));
      else if (release === "visibilitychange")
        document.dispatchEvent(new dom.window.Event(release));
      else if (release === "settings") {
        document.getElementById("help")!.click();
        run("updateUI()");
        assert.ok(document.getElementById("touch-controls")!.hidden);
        run("closeDialog(); updateUI()");
      } else if (release === "cli pause")
        run("cliPaused = true; currentInput(); cliPaused = false");
      else pointer(joystick, release, 88, 56);
      assert.equal(
        run("Math.hypot(currentInput().walkX, currentInput().walkZ)"),
        0,
      );
      assert.equal(joystick.classList.contains("pressed"), false);
      pointer(joystick, "pointermove", 88, 56);
      assert.equal(
        run("Math.hypot(currentInput().walkX, currentInput().walkZ)"),
        0,
        "old pointer cannot restart movement",
      );
    } finally {
      dom.window.close();
    }
  });
}

test("kiosk hides controls; return walk restores joystick; entering truck restores pedals", async () => {
  const { dom, run, document } = await game();
  try {
    run(stepOut);
    run(
      'execute(state, { op: "walk-to", x: -28, z: 29 }); execute(state, { op: "walk-to", x: -32, z: 29 }); interact(state); updateUI()',
    );
    assert.equal(run("state.phase"), "kiosk");
    assert.ok(document.getElementById("touch-controls")!.hidden);
    run(
      'execute(state, { op: "register", booking: state.booking }); updateUI()',
    );
    assert.equal(run("state.phase"), "walk-truck");
    assert.equal(document.getElementById("walk-joystick")!.hidden, false);
    assert.equal(document.getElementById("touch-controls")!.hidden, false);
    // Two seconds later the yard operator's phone buzzes: the camera leaves
    // the driver, the controls go, and they return once the dock is assigned.
    run('execute(state, { op: "input", seconds: 3 }); updateUI()');
    assert.equal(run("state.phase"), "dispatch");
    assert.equal(run("scene.attention"), "operator");
    assert.ok(document.getElementById("touch-controls")!.hidden);
    assert.ok(document.body.classList.contains("operator"));
    run('execute(state, { op: "dispatch", dock: 2 }); updateUI()');
    assert.equal(run("state.phase"), "walk-truck");
    assert.equal(run("scene.attention"), "driver");
    assert.equal(document.body.classList.contains("operator"), false);
    assert.equal(document.getElementById("touch-controls")!.hidden, false);
    run(
      'execute(state, { op: "walk-to", x: -28, z: 29 }); execute(state, { op: "walk-to", x: -26.5, z: state.truck.z - 2 }); interact(state); updateUI()',
    );
    assert.equal(run("state.phase"), "gate");
    assert.ok(document.getElementById("walk-joystick")!.hidden);
    assert.equal(
      document.getElementById("touch-controls")!.getAttribute("aria-label"),
      "Touch driving controls",
    );
    assert.ok(
      [...document.querySelectorAll<HTMLElement>(".touch-group")].every(
        (el) => !el.hidden,
      ),
    );
    const pedal = document.querySelector('[data-touch="forward"]')!;
    pointer(pedal, "pointerdown", 0, 0);
    assert.equal(run("currentInput().throttle"), 1);
    pointer(pedal, "pointerup", 0, 0);
    assert.equal(run("currentInput().throttle"), 0);
  } finally {
    dom.window.close();
  }
});

test("race HUD waits for movement and keeps real time while controls or leaderboard are open", async () => {
  const { dom, run, document } = await game();
  try {
    run("frame(last + 5000)");
    assert.equal(
      document.getElementById("race-clock")!.textContent,
      "00:00.00",
    );
    run('keys.add("w"); frame(last + 50); keys.clear()');
    assert.equal(run("state.race.started"), true);
    document.getElementById("help")!.click();
    const elapsed = run("state.race.elapsed");
    const z = run("state.truck.z");
    run("frame(last + 5000)");
    // Wall time is a float difference of performance.now() values.
    assert.ok(Math.abs(run("state.race.elapsed") - (elapsed + 5)) < 1e-9);
    assert.equal(run("state.truck.z"), z);
    assert.equal(
      document.getElementById("dialog-race-clock")!.textContent,
      document.getElementById("race-clock")!.textContent,
    );
    run("closeDialog()");
    document.getElementById("leaderboard-button")!.click();
    run("updateUI()");
    assert.ok(document.getElementById("touch-controls")!.hidden);
    run("frame(last + 3000)");
    assert.ok(Math.abs(run("state.race.elapsed") - (elapsed + 8)) < 1e-9);
  } finally {
    dom.window.close();
  }
});

test("a completed delivery renders splits, saves a literal driver name once, and replays from zero", async () => {
  const { dom, run, document } = await game();
  try {
    run('execute(state, { op: "demo" }); updateUI()');
    assert.equal(document.querySelectorAll(".result-splits li").length, 4);
    assert.equal(
      document.querySelectorAll(".split-rank").length,
      0,
      "no section rank when yours is the only run",
    );
    assert.equal(
      document.activeElement,
      document.querySelector(".race-results"),
    );
    const name = document.getElementById("player-name") as HTMLInputElement;
    name.value = "<b>Truck hero</b>";
    const form = document.getElementById("score-form")!;
    const submit = () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    submit();
    submit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.querySelectorAll(".leaderboard-rows li").length, 1);
    assert.equal(document.querySelector(".leaderboard-name b"), null);
    assert.ok(
      document
        .querySelector(".leaderboard-name")!
        .textContent!.startsWith(name.value),
    );
    assert.match(document.getElementById("save-status")!.textContent!, /#1/);
    const stored = JSON.parse(
      dom.window.localStorage.getItem("peritruck-leaderboard-v1")!,
    );
    assert.equal(stored.length, 1);
    assert.equal("truck" in stored[0], false);
    document.getElementById("play-again")!.click();
    run("updateUI()");
    assert.equal(run("state.phase"), "arrive");
    assert.equal(run("state.race.elapsed"), 0);
    assert.equal(run("state.race.started"), false);
    assert.equal(document.querySelector(".race-results"), null);
    assert.notEqual(document.getElementById("race-best")!.textContent, "—");
  } finally {
    dom.window.close();
  }
});

test("skipping to the dock displays a practice result with no leaderboard submission", async () => {
  const { dom, run, document } = await game();
  try {
    run(
      'skipAhead(state); skipAhead(state); skipAhead(state); execute(state, { op: "input", seconds: 1 }); updateUI()',
    );
    assert.match(
      document.getElementById("dialog-title")!.textContent!,
      /Practice/,
    );
    assert.ok(
      document.getElementById("score-form")!.classList.contains("hidden"),
    );
    assert.equal(document.body.textContent!.includes("NaN"), false);
    assert.equal(document.querySelectorAll(".split-toggle").length, 4);
    assert.equal(
      document.querySelectorAll(".split-rank").length,
      0,
      "skipped stages carry no section rank",
    );
    assert.match(
      document.getElementById("save-status")!.textContent!,
      /Skipped stages/,
    );
    assert.equal(
      dom.window.localStorage.getItem("peritruck-leaderboard-v1"),
      null,
    );
  } finally {
    dom.window.close();
  }
});

test("stage rows show your section rank and expand one section board at a time", async () => {
  const { dom, run, document } = await game();
  try {
    const rival = (name: string, splits: number[], date: string) => ({
      id: name,
      name,
      seconds: splits[3],
      splits,
      contacts: 0,
      recoveries: 0,
      assisted: true,
      date,
    });
    // Ace: instant parking, kiosk and gate, slow dock. Bea: slow everywhere.
    dom.window.localStorage.setItem(
      "peritruck-leaderboard-v1",
      JSON.stringify([
        rival("Ace", [1, 2, 3, 600], "2026-09-01T00:00:00.000Z"),
        rival("Bea", [800, 1800, 2800, 3800], "2026-09-02T00:00:00.000Z"),
      ]),
    );
    run('execute(state, { op: "demo" }); updateUI()');
    const chips = () =>
      [...document.querySelectorAll(".split-rank")].map((el) => [
        el.textContent,
        el.className,
      ]);
    assert.deepEqual(chips(), [
      ["#2", "split-rank rank-podium"],
      ["#2", "split-rank rank-podium"],
      ["#2", "split-rank rank-podium"],
      ["#1", "split-rank rank-first"],
    ]);
    const toggle = (i: number) =>
      document.getElementById(`split-toggle-${i}`) as HTMLButtonElement;
    const board = (i: number) => document.getElementById(`split-board-${i}`)!;
    assert.ok([0, 1, 2, 3].every((i) => board(i).hidden));
    assert.equal(
      toggle(3).getAttribute("aria-label"),
      `Park at your dock: ${toggle(3).querySelector("b")!.textContent}, ranked 1 of 3`,
    );
    toggle(3).click();
    assert.equal(toggle(3).getAttribute("aria-expanded"), "true");
    assert.equal(board(3).hidden, false);
    assert.equal(document.activeElement, toggle(3));
    assert.equal(
      board(3).querySelector(".split-board-title b")!.textContent,
      "Fastest dock times",
    );
    const rows = board(3).querySelectorAll(".leaderboard-rows li");
    assert.equal(rows.length, 3);
    assert.ok(rows[0].classList.contains("your-result"));
    assert.equal(
      rows[0].querySelector(".leaderboard-name")!.firstChild!.textContent,
      "You",
    );
    assert.equal(rows[0].querySelector("small")!.textContent, "Section best");
    assert.match(
      rows[1].querySelector("small")!.textContent!,
      /^\+\d\d:\d\d\.\d\d$/,
    );
    toggle(0).click();
    assert.equal(board(3).hidden, true, "only one section open at a time");
    assert.equal(board(0).hidden, false);
    assert.equal(
      board(0).querySelector(".your-result .leaderboard-rank")!.textContent,
      "02",
    );
    (document.getElementById("player-name") as HTMLInputElement).value =
      "Truck hero";
    document
      .getElementById("score-form")!
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(board(0).hidden, false, "saving keeps the open section");
    const you = board(0).querySelector(".your-result .leaderboard-name")!;
    assert.equal(you.firstChild!.textContent, "Truck hero");
    assert.match(
      you.querySelector("small")!.textContent!,
      /^\+\d\d:\d\d\.\d\d · You$/,
    );
    assert.deepEqual(
      chips().map(([rank]) => rank),
      ["#2", "#2", "#2", "#1"],
    );
    toggle(0).click();
    assert.ok([0, 1, 2, 3].every((i) => board(i).hidden));
    assert.equal(toggle(0).getAttribute("aria-expanded"), "false");
  } finally {
    dom.window.close();
  }
});

test("feedback form opens from the top bar and the results screen and sends to Sentry", async () => {
  const { dom, run, document, sentFeedback } = await game();
  try {
    document.getElementById("feedback")!.click();
    assert.match(
      document.getElementById("dialog-title")!.textContent!,
      /what you think/,
    );
    const form = document.getElementById("feedback-form") as HTMLFormElement;
    // Bypass native `required` validation to reach the script-side guard.
    const submit = () =>
      form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    submit();
    await Promise.resolve();
    assert.equal(sentFeedback.length, 0, "empty message is not sent");
    assert.match(
      document.getElementById("form-error")!.textContent!,
      /few words/,
    );
    (document.getElementById("feedback-message") as HTMLTextAreaElement).value =
      "Trailer clipped through the gate.";
    (document.getElementById("feedback-email") as HTMLInputElement).value =
      "driver@example.com";
    submit();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(JSON.parse(JSON.stringify(sentFeedback)), [
      {
        message: "Trailer clipped through the gate.",
        email: "driver@example.com",
        source: "topbar",
        phase: "arrive",
      },
    ]);
    assert.ok(form.classList.contains("hidden"));
    assert.equal(
      document.getElementById("feedback-thanks")!.classList.contains("hidden"),
      false,
    );
    document.getElementById("close-dialog")!.click();
    assert.equal(document.getElementById("modal-root")!.firstChild, null);

    run(
      'skipAhead(state); skipAhead(state); skipAhead(state); execute(state, { op: "input", seconds: 1 }); updateUI()',
    );
    assert.match(
      document.getElementById("dialog-title")!.textContent!,
      /Practice/,
    );
    document.getElementById("results-feedback")!.click();
    assert.ok(document.getElementById("feedback-form"));
    document.getElementById("feedback-cancel")!.click();
    assert.match(
      document.getElementById("dialog-title")!.textContent!,
      /Practice/,
      "closing feedback returns to the results screen",
    );
    assert.ok(document.getElementById("results-feedback"));
  } finally {
    dom.window.close();
  }
});
