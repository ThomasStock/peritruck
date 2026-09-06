import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";

// Run the real controls and simulation, without WebGL or the kiosk's own UI.
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
    step: require("./game/simulation").step,
    exports: {},
    importMeta: {},
    require: (id: string) => {
      if (id.endsWith(".css")) return {};
      if (id === "./kiosk/view")
        return { mountKiosk: () => ({ destroy() {} }) };
      if (id === "./scene")
        return {
          YardScene: class {
            loaded = true;
            mode = "follow";
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
  return { dom, run, document: window.document };
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
