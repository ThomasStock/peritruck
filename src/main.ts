import "./sentry";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/500.css";
import "@fontsource/open-sans/600.css";
import "@fontsource/open-sans/700.css";
import "@fontsource/open-sans/800.css";
import "./style.css";
import "./kiosk/kiosk.css";
import "./sms.css";
import { YardScene } from "./scene";
import {
  BOOKING,
  createState,
  idleInput,
  step,
  DT,
  objective,
  prompt,
  slowDown,
  interact,
  walking,
  distance,
  parking,
  docking,
  angle,
  register,
  enterPin,
  recover,
  skipAhead,
  smsReceived,
  note,
  snapshot,
  rigRects,
  corners,
  staticRigs,
  rear,
  type Input,
} from "./game/simulation";
import { execute } from "./game/commands";
import { mountKiosk, type KioskController } from "./kiosk/view";
import { clock, phoneHtml, smsBannerHtml } from "./sms";
import { walkingJoystick } from "./walking-joystick";
import { STAGES, formatTime, tickRace, type Race } from "./game/race";
import {
  createLeaderboard,
  resultFromRace,
  cleanName,
  type Result,
} from "./game/leaderboard";
const leaderboard = createLeaderboard(() => localStorage);
let leaderboardOpen = false;
let completedRace: Race | undefined;
let completedResult: Result | undefined;
let savedResultId = "";
const app = document.querySelector<HTMLDivElement>("#app")!;
const isEditable = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest('input,textarea,[contenteditable="true"]');
for (const type of ["selectstart", "contextmenu", "dblclick"]) {
  app.addEventListener(type, (event) => {
    if (!isEditable(event.target)) event.preventDefault();
  });
}
app.addEventListener("dragstart", (event) => event.preventDefault());
// Safari trackpad gestures and Ctrl+wheel can bypass touch-action.
for (const type of ["gesturestart", "gesturechange"]) {
  document.addEventListener(type, (event) => event.preventDefault(), {
    passive: false,
  });
}
document.addEventListener(
  "wheel",
  (event) => {
    if (event.ctrlKey) event.preventDefault();
  },
  { passive: false },
);
app.innerHTML = `
<div id="world"></div>
<header class="topbar"><a class="brand" href="/" aria-label="Peripass"><img src="/brand/peripass.svg" alt="Peripass"/></a><div class="top-actions"><button id="leaderboard-button" class="leaderboard-button" aria-label="View local leaderboard">♛ <span>Leaderboard</span></button><button id="camera" class="icon-button" aria-label="Change camera view" title="Camera · C">◩</button><button id="help" class="icon-button" aria-label="Controls and settings" title="Controls · Escape">?</button></div></header>
<section id="intro" class="intro panel"><div class="race-kicker">PERITRUCK · TIME TRIAL</div><h1>Big truck.<br/>Quick delivery.</h1><p>Park. Check in. Open the gate. Nail the dock. How fast can you finish?</p><div class="intro-stages">${STAGES.map((stage, i) => `<span><b>0${i + 1}</b>${stage.short}</span>`).join("")}</div><button id="start" class="primary" disabled>Loading… <span>↗</span></button><small class="race-intro-note">The clock starts when your truck moves.</small><div id="intro-best" class="intro-best"></div></section>
<section id="race-hud" class="race-hud hidden" aria-label="Time trial progress"><div class="race-clock-row"><div><span class="race-kicker" id="race-status">READY WHEN YOU ARE</span><strong id="race-clock" role="timer" aria-label="Elapsed run time">00:00.00</strong></div><div class="race-best"><span>LOCAL BEST</span><b id="race-best">—</b></div></div><ol class="race-stages">${STAGES.map((stage, i) => `<li id="race-stage-${i}"><span class="stage-number">${i + 1}</span><span>${stage.short}</span><b id="race-split-${i}">—</b></li>`).join("")}</ol></section>
<aside id="mission" class="mission panel hidden"><div class="eyebrow" id="step-label">01 / 04 · ARRIVAL</div><h1 id="objective-title"></h1><p id="objective-detail"></p><div class="mission-progress"><i></i><i></i><i></i><i></i></div><div class="delivery-note"><span id="note-label">YOUR DELIVERY</span><b id="delivery-reference">${BOOKING} <span>→</span> Ghent</b><small id="note-detail">Registration reference</small></div><div id="stage-hint" class="stage-hint"></div></aside>
<button id="map-button" class="minimap panel hidden" aria-label="Show whole yard map"><div><span>YARD MAP</span><span>↗</span></div><canvas id="map" width="340" height="270" aria-label="Yard map showing the truck, destination, gate and docks"></canvas><span class="map-key"><i></i> You <b>◎</b> Destination <span>N ↑</span></span></button>
<div id="target-label" class="target-label hidden"><span id="target-symbol" class="target-number">P</span><div><b id="target-name">HOLDING BAY P02</b><small id="target-distance"></small></div></div>
<div id="action-wrap" class="action-wrap hidden"><button id="interact" class="action"><kbd id="interact-key">E</kbd><span id="action-text"></span><span>↗</span></button></div>
<div id="toast" role="status" aria-live="polite" class="toast hidden"></div>
<div id="sms-banner" role="status" aria-live="polite" class="sms-banner hidden" title="Dismiss"></div>
<button id="cli-resume" class="cli-resume hidden">CLI control · Resume ↗</button>
<footer class="bottom-bar"><div class="controls-hint" id="controls-hint"></div></footer>
<div id="dock-guide" class="dock-guide panel hidden"><div class="eyebrow">03 · DOCKING GUIDE</div><strong id="dock-coach">Trailer first.</strong><div class="dock-measure"><span>Side offset</span><b id="dock-offset"></b></div><div class="dock-meter"><i id="dock-needle"></i><span></span></div><div class="dock-measure"><span>Trailer angle</span><b id="dock-angle"></b></div><div class="dock-measure"><span>To bumper</span><b id="dock-gap"></b></div><p id="dock-tip"></p></div>
<div id="telemetry" class="telemetry panel hidden"><div class="gear"><b id="gear">N</b><span>AUTO</span></div><div class="speed"><b id="speed">00</b><span>KM/H</span></div><div id="assist-tag" class="assist-tag"><span class="live-dot"></span> REVERSE ASSIST</div><div class="articulation"><span>TRAILER</span><div><i id="articulation-bar"></i></div><b id="articulation-value">0°</b></div></div>
<div id="touch-controls" aria-label="Touch driving controls"><div class="touch-group"><button data-touch="left" aria-label="Steer left">←</button><button data-touch="right" aria-label="Steer right">→</button></div><div class="touch-group pedals"><button data-touch="reverse" aria-label="Brake then reverse">↓<small>REVERSE</small></button><button data-touch="forward" aria-label="Drive forward">↑<small>DRIVE</small></button><button data-touch="brake" aria-label="Brake">■</button></div><div id="walk-joystick" class="walking-joystick" role="group" aria-label="Walking joystick: drag to move" hidden><span class="joystick-knob"></span></div></div>
<div id="modal-root"></div>
`;
const $ = (id: string) => document.getElementById(id)!;
let state = createState(),
  started = false,
  last = performance.now(),
  accumulator = 0,
  cliPaused = false,
  settingsOpen = false;
const keys = new Set<string>(),
  touch = new Set<string>();
const joystick = walkingJoystick($("walk-joystick"));
let touchWalking = false,
  touchEnabled = false;
const defaults: Record<string, string> = {
  forward: "w",
  reverse: "s",
  left: "a",
  right: "d",
  brake: " ",
  precision: "shift",
  interact: "e",
  camera: "c",
  recover: "r",
};
let bindings = { ...defaults },
  soundEnabled = false,
  reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
try {
  const saved = JSON.parse(localStorage.getItem("yard-settings") ?? "null");
  if (saved) {
    bindings = { ...defaults, ...saved.bindings };
    state.assisted = saved.assisted ?? true;
    reducedMotion = saved.reducedMotion ?? reducedMotion;
  }
} catch {
  /* unavailable storage does not block play */
}
let scene: YardScene;
try {
  scene = new YardScene($("world"));
} catch {
  app.innerHTML =
    '<div class="fallback"><h1>Your browser needs WebGL.</h1><p>Try a current Chrome, Edge, Firefox or Safari browser to drive in the yard.</p><button onclick="location.reload()">Try again</button></div>';
  throw new Error("WebGL unavailable");
}
scene.reducedMotion = reducedMotion;
document.documentElement.dataset.reducedMotion = String(reducedMotion);
scene.renderer.domElement.tabIndex = 0;
function saveSettings() {
  try {
    localStorage.setItem(
      "yard-settings",
      JSON.stringify({ bindings, assisted: state.assisted, reducedMotion }),
    );
  } catch {}
}
function keyLabel(key: string) {
  return key === " "
    ? "Space"
    : key === "shift"
      ? "Shift"
      : key.length === 1
        ? key.toUpperCase()
        : key;
}
function updateKeyHints() {
  $("controls-hint").replaceChildren();
  for (const [actions, label] of [
    [["forward", "reverse"], "Drive / reverse"],
    [["left", "right"], "Steer"],
    [["brake"], "Brake"],
    [["precision"], "Precision"],
  ] as [string[], string][]) {
    const span = document.createElement("span");
    for (const a of actions) {
      const k = document.createElement("kbd");
      k.textContent = keyLabel(bindings[a]);
      span.append(k);
    }
    span.append(document.createTextNode(label));
    $("controls-hint").append(span);
  }
  $("interact-key").textContent = keyLabel(bindings.interact);
}
updateKeyHints();
let audio: AudioContext | undefined,
  engine: OscillatorNode | undefined,
  engineGain: GainNode | undefined,
  lastBeep = 0;
function enableAudio() {
  if (!audio) {
    audio = new AudioContext();
    engine = audio.createOscillator();
    engine.type = "triangle";
    engineGain = audio.createGain();
    engineGain.gain.value = 0;
    engine.connect(engineGain);
    engineGain.connect(audio.destination);
    engine.start();
  }
  void audio.resume();
}
function beep(freq = 660) {
  if (!soundEnabled || !audio) return;
  const osc = audio.createOscillator(),
    g = audio.createGain();
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.035, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.16);
  osc.connect(g);
  g.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.17);
}
function start() {
  if (!scene.loaded) return;
  started = true;
  cliPaused = false;
  document.body.classList.add("playing");
  $("intro").classList.add("hidden");
  $("mission").classList.remove("hidden");
  $("map-button").classList.remove("hidden");
  $("telemetry").classList.remove("hidden");
  $("race-hud").classList.remove("hidden");
  scene.renderer.domElement.focus();
}
function currentInput(): Input {
  syncTouchControls();
  const down = (action: string, arrow = "") =>
    keys.has(bindings[action]) || keys.has(arrow) || touch.has(action);
  const i = idleInput();
  i.throttle =
    Number(down("forward", "arrowup")) - Number(down("reverse", "arrowdown"));
  i.steer =
    Number(down("left", "arrowleft")) - Number(down("right", "arrowright"));
  i.brake = down("brake");
  i.precision = down("precision");
  const gamepad = navigator.getGamepads?.().find((g) => g?.connected);
  if (gamepad && !settingsOpen) {
    if (Math.abs(gamepad.axes[0]) > 0.15) i.steer = -gamepad.axes[0];
    const pedal =
      (gamepad.buttons[7]?.value ?? 0) - (gamepad.buttons[6]?.value ?? 0);
    if (Math.abs(pedal) > 0.05) i.throttle = pedal;
    i.brake ||= !!gamepad.buttons[1]?.pressed;
  }
  i.walkX = -i.steer;
  i.walkZ = -i.throttle;
  if (walking(state) && (joystick.value.x || joystick.value.z)) {
    i.walkX = joystick.value.x;
    i.walkZ = joystick.value.z;
  }
  // Walking uses screen-relative arrows for the fixed isometric view.
  if (walking(state) && scene.mode === "follow") {
    const x = i.walkX,
      z = i.walkZ;
    i.walkX = x * 0.81 + z * 0.59;
    i.walkZ = -x * 0.59 + z * 0.81;
  }
  return i;
}
$("start").onclick = start;
$("leaderboard-button").onclick = () => {
  leaderboardOpen = true;
  syncDialog();
};
$("camera").onclick = () => {
  scene.mode =
    scene.mode === "follow"
      ? "yard"
      : scene.mode === "yard"
        ? "overhead"
        : "follow";
  $("camera").setAttribute("aria-label", `Camera: ${scene.mode}. Change view`);
  note(
    state,
    `${scene.mode === "follow" ? "Follow" : scene.mode === "yard" ? "Whole yard" : "Overhead"} camera`,
  );
};
$("map-button").onclick = () => {
  scene.mode = scene.mode === "yard" ? "follow" : "yard";
};
$("interact").onclick = () => {
  interact(state);
  syncDialog();
};
$("help").onclick = () => {
  settingsOpen = true;
  keys.clear();
  syncDialog();
};
$("cli-resume").onclick = () => {
  cliPaused = false;
  accumulator = 0;
};
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-touch]",
)) {
  button.onpointerdown = (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    touch.add(button.dataset.touch!);
    button.classList.add("pressed");
  };
  const release = () => {
    touch.delete(button.dataset.touch!);
    button.classList.remove("pressed");
  };
  button.onpointerup = release;
  button.onpointercancel = release;
  button.onlostpointercapture = release;
}
let remapping: string | null = null,
  lastDialog = "",
  modalReturnFocus: HTMLElement | null = null,
  kiosk: KioskController | null = null;
function closeDialog() {
  settingsOpen = false;
  leaderboardOpen = false;
  if (state.phase === "kiosk") state.phase = "walk-kiosk";
  if (state.phase === "pin") state.phase = "gate";
  remapping = null;
  clearInput();
  syncDialog();
}
window.addEventListener("keydown", (e) => {
  if (remapping) {
    e.preventDefault();
    const key = e.key.toLowerCase();
    if (key === "escape") {
      remapping = null;
      lastDialog = "";
      syncDialog();
      return;
    }
    if (["tab", "meta", "control", "alt"].includes(key)) return;
    const old = bindings[remapping];
    for (const action in bindings)
      if (bindings[action] === key) bindings[action] = old;
    bindings[remapping] = key;
    remapping = null;
    saveSettings();
    updateKeyHints();
    lastDialog = "";
    syncDialog();
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    if ($("modal-root").firstChild) closeDialog();
    else {
      settingsOpen = true;
      keys.clear();
      syncDialog();
    }
    return;
  }
  if ($("modal-root").firstChild) {
    if (e.key === "Tab") {
      const nodes = [
        ...$("modal-root").querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,select,[tabindex="0"]',
        ),
      ].filter((node) => node.getClientRects().length > 0);
      const first = nodes[0],
        last = nodes.at(-1),
        active = document.activeElement as HTMLElement | null,
        inside = active ? nodes.includes(active) : false;
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first?.focus();
      }
    }
    return;
  }
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
  )
    return;
  const k = e.key.toLowerCase();
  if (
    [" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k) ||
    Object.values(bindings).includes(k)
  )
    e.preventDefault();
  keys.add(k);
  if (e.repeat) return;
  if (k === bindings.interact && started) {
    interact(state);
    syncDialog();
  }
  if (k === bindings.camera) $("camera").click();
  if (k === bindings.recover && started) recover(state);
  if (k === "enter" && !started) start();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
const clearInput = () => {
  keys.clear();
  touch.clear();
  joystick.reset();
  document.querySelectorAll("[data-touch].pressed").forEach((button) => {
    button.classList.remove("pressed");
  });
};
function syncTouchControls() {
  const isWalking = walking(state);
  const enabled =
    started &&
    !settingsOpen &&
    !leaderboardOpen &&
    !cliPaused &&
    !document.hidden &&
    !["kiosk", "pin", "complete"].includes(state.phase);
  if (isWalking === touchWalking && enabled === touchEnabled) return;
  clearInput();
  touchWalking = isWalking;
  touchEnabled = enabled;
  $("touch-controls").hidden = !enabled;
  $("touch-controls").setAttribute(
    "aria-label",
    isWalking ? "Touch walking controls" : "Touch driving controls",
  );
  $("walk-joystick").hidden = !isWalking;
  document.querySelectorAll<HTMLElement>(".touch-group").forEach((group) => {
    group.hidden = isWalking;
  });
  document.body.classList.toggle("walking", isWalking);
}
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  clearInput();
  accumulator = 0;
});
function modal(title: string, body: string, cls = "") {
  modalReturnFocus = document.activeElement as HTMLElement;
  $("modal-root").innerHTML =
    `<div class="modal-scrim"><section class="dialog ${cls}" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"><button class="dialog-close" id="close-dialog" aria-label="Close dialog">×</button><div class="eyebrow">PERIPASS${state.race.started && state.phase !== "complete" ? `<span id="dialog-race-clock" class="dialog-race-clock" role="timer" aria-label="Elapsed run time">${formatTime(state.race.elapsed)}</span>` : ""}</div><h2 id="dialog-title">${title}</h2>${body}</section></div>`;
  $("close-dialog").onclick = closeDialog;
  clearInput();
  // Move focus onto the dialog itself, not its first control, so nothing
  // lights up on open while Escape and the Tab trap keep working.
  $("modal-root")
    .querySelector<HTMLElement>(".dialog")
    ?.focus({ preventScroll: true });
}
function syncDialog() {
  const kind = leaderboardOpen
    ? "leaderboard"
    : settingsOpen
      ? "settings"
      : ["kiosk", "pin", "complete"].includes(state.phase)
        ? state.phase
        : "";
  if (kind === lastDialog) return;
  lastDialog = kind;
  kiosk?.destroy();
  kiosk = null;
  if (!kind) {
    $("modal-root").replaceChildren();
    modalReturnFocus?.focus();
    return;
  }
  if (kind === "leaderboard") {
    modal(
      "Yard legends",
      `<p class="dialog-description">Fastest deliveries on this browser. Your next run could take the top spot.</p><div id="leaderboard-list"></div><p class="local-note">Local leaderboard · Top 100 · Lower is better</p><button id="back-to-yard" class="primary">Back to the yard <span>↗</span></button>`,
      "leaderboard-dialog",
    );
    renderLeaderboard();
    $("back-to-yard").onclick = closeDialog;
  } else if (kind === "settings") {
    modal(
      "Controls",
      `<p class="dialog-description">Driving is paused. Once started, your race clock keeps running.</p>
      <label class="setting-row"><span><b>Trailer reverse assist</b><small>Steer where you want the trailer to go. Release to straighten.</small></span><input id="assist-setting" type="checkbox" ${state.assisted ? "checked" : ""}/></label>
      <label class="setting-row"><span><b>Sound</b><small>Engine hum and gentle reversing cues.</small></span><input id="sound-setting" type="checkbox" ${soundEnabled ? "checked" : ""}/></label>
      <label class="setting-row"><span><b>Reduced motion</b><small>Instant camera changes; no pulsing markers.</small></span><input id="motion-setting" type="checkbox" ${reducedMotion ? "checked" : ""}/></label>
      <div class="controls-title">YOUR CONTROLS <span>Click a key to change it</span></div><div class="keybindings" id="keybindings"></div>
      <p class="settings-tip">Hold S to brake, then reverse. A / D steer the cab forward and aim the trailer in reverse. Shift keeps things slow. Space stops the truck. Arrow keys also work.</p>
      <div class="dialog-buttons"><button id="resume" class="primary">Resume <span>↗</span></button><button id="recover" class="secondary">Recover to safe stop</button><button id="restart" class="text-button">Restart run</button></div>`,
      "settings-dialog",
    );
    for (const [action, key] of Object.entries(bindings)) {
      const label = document.createElement("span");
      label.textContent = (
        {
          forward: "Drive",
          reverse: "Brake / reverse",
          left: "Left",
          right: "Right",
          brake: "Brake",
          precision: "Precision",
          interact: "Interact",
          camera: "Camera",
          recover: "Recover",
        } as Record<string, string>
      )[action];
      const button = document.createElement("button");
      button.className = "keybind";
      button.textContent =
        remapping === action ? "Press a key…" : keyLabel(key);
      button.setAttribute("aria-label", `Remap ${action}: ${keyLabel(key)}`);
      button.onclick = () => {
        remapping = action;
        button.textContent = "Press a key…";
      };
      label.append(button);
      $("keybindings").append(label);
    }
    $("assist-setting").onchange = (e) => {
      state.assisted = (e.target as HTMLInputElement).checked;
      saveSettings();
    };
    $("sound-setting").onchange = (e) => {
      soundEnabled = (e.target as HTMLInputElement).checked;
      if (soundEnabled) enableAudio();
    };
    $("motion-setting").onchange = (e) => {
      reducedMotion = (e.target as HTMLInputElement).checked;
      scene.reducedMotion = reducedMotion;
      document.documentElement.dataset.reducedMotion = String(reducedMotion);
      saveSettings();
    };
    $("resume").onclick = closeDialog;
    $("recover").onclick = () => {
      recover(state);
      closeDialog();
    };
    $("restart").onclick = () => {
      const assisted = state.assisted;
      state = createState();
      state.assisted = assisted;
      settingsOpen = false;
      closeDialog();
      start();
    };
  } else if (kind === "kiosk") {
    // The self-service kiosk: language, check-in method, reference, phone, endscreen.
    modalReturnFocus = document.activeElement as HTMLElement;
    clearInput();
    kiosk = mountKiosk($("modal-root"), {
      booking: state.booking,
      onQuit: closeDialog,
      onComplete: (reference) => {
        if (register(state, reference)) syncDialog();
      },
    });
    const kioskStage = $("modal-root").querySelector(".kiosk-stage");
    if (kioskStage) {
      kioskStage.classList.add("timed-kiosk");
      const strip = document.createElement("div");
      strip.className = "kiosk-race-strip";
      strip.innerHTML = `<span>TIME TRIAL · CHECK-IN</span><b id="dialog-race-clock" role="timer" aria-label="Elapsed run time">${formatTime(state.race.elapsed)}</b>`;
      kioskStage.append(strip);
    }
  } else if (kind === "pin") {
    // The driver reads the SMS on their phone and types the PIN into the gate terminal.
    modal(
      "Automated gate access",
      `<p class="dialog-description">Read the PIN in the SMS on your phone and enter it at the gate terminal.</p><div class="gate-layout"><div class="phone-peek">${phoneHtml(state.booking, state.pin, smsClock || clock())}</div><form id="pin-form" class="gate-terminal"><div class="eyebrow"><span class="live-dot"></span> GATE TERMINAL</div><label class="field">Gate PIN<input id="pin-input" inputmode="none" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="— — — —" aria-label="Four digit gate PIN" required /></label><div class="pin-grid">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "⌫"].map((k) => `<button type="button" data-pin="${k}" aria-label="${k === "⌫" ? "Delete digit" : k}">${k}</button>`).join("")}</div><div id="form-error" class="form-error" role="alert"></div><button class="primary" type="submit">Open the gate <span>↗</span></button></form></div>`,
      "pin-dialog",
    );
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-pin]"))
      b.onclick = () => {
        const input = $("pin-input") as HTMLInputElement,
          k = b.dataset.pin!;
        input.value =
          k === "Clear"
            ? ""
            : k === "⌫"
              ? input.value.slice(0, -1)
              : (input.value + k).slice(0, 4);
      };
    $("pin-form").onsubmit = (e) => {
      e.preventDefault();
      if (enterPin(state, ($("pin-input") as HTMLInputElement).value)) {
        beep(880);
        syncDialog();
      } else {
        $("form-error").textContent = state.message;
        ($("pin-input") as HTMLInputElement).select();
      }
    };
  } else {
    if (completedRace !== state.race) {
      completedRace = state.race;
      completedResult = resultFromRace(state.race, state);
    }
    const result = completedResult!;
    const best = leaderboard.list()[0];
    const eligible =
      !state.race.practice && result.splits.length === STAGES.length;
    const newBest = eligible && (!best || result.seconds < best.seconds);
    const saved = savedResultId === result.id;
    modal(
      newBest
        ? "That's a quick delivery!"
        : eligible
          ? "Delivery nailed!"
          : "Practice complete!",
      `<div class="finish-stripe" aria-hidden="true"></div><div class="result-badge">${!eligible ? "↻ PRACTICE RUN" : newBest ? "★ LOCAL BEST" : "✓ RUN COMPLETE"}</div><div class="result-time">${formatTime(result.seconds)}</div><p class="result-comparison">${!eligible ? "Ready to try the full delivery?" : !best ? "First run on the board. Set the pace!" : newBest ? `${formatTime(best.seconds - result.seconds)} faster than the local best` : `${formatTime(result.seconds - best.seconds)} off the local best. Go again?`}</p><ol class="result-splits">${STAGES.map((stage, i) => `<li><span class="stage-number">✓</span><span>${stage.name}</span><b>${result.splits[i] === undefined ? "—" : formatTime(result.splits[i] - (result.splits[i - 1] ?? 0))}</b></li>`).join("")}</ol><div class="result-stats"><span>${result.contacts} contacts</span><span>${result.recoveries} recoveries</span><span>${result.assisted ? "Assist on" : "Classic steering"}</span></div><form id="score-form" class="score-form ${saved || !eligible ? "hidden" : ""}"><label for="player-name">Put your name on the board</label><div><input id="player-name" maxlength="24" placeholder="Your driver name" autocomplete="nickname" required aria-describedby="save-status"/><button class="primary" type="submit">Save run <span>↗</span></button></div></form><p id="save-status" class="local-note" role="status">${!eligible ? "Skipped stages make this a practice run. Complete all four stages to join the leaderboard." : saved ? "Your run is on the board." : "Save your run on this browser. No account needed."}</p><div class="result-board-title"><b>♛ Yard legends</b><span>LOCAL TOP 5</span></div><div id="leaderboard-list"></div><button id="play-again" class="primary play-again">Beat your time <span>↻</span></button>`,
      "complete-dialog race-results",
    );
    $("close-dialog").classList.add("hidden");
    renderLeaderboard(result.id, 5);
    $("score-form").onsubmit = (event) => {
      event.preventDefault();
      if (!eligible) return;
      const input = $("player-name") as HTMLInputElement;
      const name = cleanName(input.value);
      if (!name) {
        input.setCustomValidity("Enter your driver name.");
        input.reportValidity();
        return;
      }
      const saved = leaderboard.save({ ...result, name });
      savedResultId = result.id;
      $("score-form").classList.add("hidden");
      $("save-status").textContent = saved.persisted
        ? `You're #${saved.rank}! ${saved.rank > 100 ? "Only the fastest 100 runs stay on the board." : "Run saved on this browser."}`
        : `You're #${saved.rank}! Browser storage is unavailable; this run stays for this visit only.`;
      renderLeaderboard(result.id, 5);
      refreshBest();
      $("play-again").focus();
    };
    $("player-name").oninput = () =>
      ($("player-name") as HTMLInputElement).setCustomValidity("");
    $("play-again").onclick = () => {
      const assisted = state.assisted;
      state = createState();
      state.assisted = assisted;
      syncDialog();
      start();
    };
    beep(880);
  }
}
function refreshBest() {
  const best = leaderboard.list()[0];
  $("race-best").textContent = best ? formatTime(best.seconds) : "—";
  $("intro-best").textContent = best
    ? `♛ Time to beat  ${formatTime(best.seconds)} · ${best.name}`
    : "Fresh leaderboard. Set the first record.";
}
function renderLeaderboard(highlight = "", limit = 100) {
  const rows = leaderboard.list();
  const root = $("leaderboard-list");
  root.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "leaderboard-empty";
    empty.textContent = "No legends yet. Make the first delivery count.";
    root.append(empty);
    return;
  }
  const ol = document.createElement("ol");
  ol.className = "leaderboard-rows";
  const visible = rows.slice(0, limit);
  const own = rows.find((r) => r.id === highlight);
  if (own && !visible.includes(own)) visible.push(own);
  for (const row of visible) {
    const rank = rows.indexOf(row) + 1;
    const li = document.createElement("li");
    li.classList.toggle("your-result", row.id === highlight);
    const position = document.createElement("span");
    position.className = "leaderboard-rank";
    position.textContent = rank === 1 ? "♛" : String(rank).padStart(2, "0");
    const name = document.createElement("span");
    name.className = "leaderboard-name";
    name.textContent = row.name;
    const meta = document.createElement("small");
    meta.textContent = `${row.contacts} contacts · ${row.recoveries} recoveries · ${row.assisted ? "Assist" : "Classic"}${row.id === highlight ? " · You" : ""}`;
    name.append(meta);
    const time = document.createElement("b");
    time.textContent = formatTime(row.seconds);
    li.append(position, name, time);
    ol.append(li);
  }
  root.append(ol);
}
refreshBest();
window.addEventListener("storage", () => {
  refreshBest();
  if (document.getElementById("leaderboard-list"))
    renderLeaderboard(
      completedResult?.id,
      state.phase === "complete" && !leaderboardOpen ? 5 : 100,
    );
});
function drawMap() {
  const canvas = $("map") as HTMLCanvasElement,
    ctx = canvas.getContext("2d")!,
    w = canvas.width,
    h = canvas.height;
  const xy = (x: number, z: number) => [
    ((x + 58) / 116) * w,
    ((z + 66) / 148) * h,
  ];
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#dce7dc";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#b1c6bb";
  const a = xy(-51, -63),
    b = xy(51, -45);
  ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
  ctx.strokeStyle = "#96ac9e";
  ctx.lineWidth = 1;
  for (const [x1, x2] of [
    [-52, 12],
    [24, 52],
  ]) {
    const p = xy(x1, 12),
      q = xy(x2, 12);
    ctx.beginPath();
    ctx.moveTo(...(p as [number, number]));
    ctx.lineTo(...(q as [number, number]));
    ctx.stroke();
  }
  for (const [i, x] of [-42, -24, -6].entries()) {
    const p = xy(x - 3, 32),
      q = xy(x + 3, 55);
    ctx.strokeStyle = i === 1 ? "#00a990" : "#a1b6a7";
    ctx.strokeRect(p[0], p[1], q[0] - p[0], q[1] - p[1]);
  }
  for (const [t, color] of [
    ...staticRigs.map((t) => [t, "#8ba697"] as const),
    [state.truck, "#164d3b"] as const,
  ]) {
    ctx.fillStyle = color;
    for (const r of rigRects(t)) {
      const c = corners(r);
      const ordered = [c[0], c[1], c[3], c[2]];
      ctx.beginPath();
      ordered.forEach((p, i) => {
        const v = xy(p.x, p.z);
        if (i) ctx.lineTo(v[0], v[1]);
        else ctx.moveTo(v[0], v[1]);
      });
      ctx.closePath();
      ctx.fill();
    }
  }
  const o = objective(state),
    p = xy(o.target.x, o.target.z);
  ctx.strokeStyle = "#00a990";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
  ctx.stroke();
  if (walking(state)) {
    const p = xy(state.driver.x, state.driver.z);
    ctx.fillStyle = "#e78238";
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
let uiTick = 0,
  lastGamepadAction = false,
  skipHeldSince = 0;
// The SMS lands SMS_DELAY seconds of simulation time after check-in. The banner
// is presentation only: what the phone shows comes from the simulation state.
let smsSeen = false,
  smsClock = "",
  smsBannerUntil = 0,
  smsBannerTimer: ReturnType<typeof setTimeout> | undefined;
function showSmsBanner() {
  const banner = $("sms-banner");
  clearTimeout(smsBannerTimer);
  banner.innerHTML = smsBannerHtml(state.booking, state.pin);
  banner.classList.remove("hidden");
  void banner.offsetWidth; // commit display before the slide-in transition
  banner.classList.add("is-in");
  smsBannerUntil = state.elapsed + 9;
  beep(880);
  setTimeout(() => beep(1175), 130);
  try {
    navigator.vibrate?.([90, 60, 90]);
  } catch {
    /* no haptics */
  }
}
function hideSmsBanner() {
  const banner = $("sms-banner");
  if (banner.classList.contains("hidden")) return;
  banner.classList.remove("is-in");
  clearTimeout(smsBannerTimer);
  smsBannerTimer = setTimeout(() => banner.classList.add("hidden"), 600);
}
$("sms-banner").onclick = hideSmsBanner;
function syncSms() {
  const received = smsReceived(state);
  if (!state.registered && smsSeen) {
    // Restart or reset: the next check-in gets a fresh message.
    smsSeen = false;
    smsClock = "";
    smsBannerUntil = 0;
    hideSmsBanner();
  }
  if (received && !smsSeen) {
    smsSeen = true;
    smsClock = clock();
    // Only a message received on foot or in the cab drops in; a skip straight to the dock is silent.
    if (["walk-truck", "gate"].includes(state.phase)) showSmsBanner();
  }
  if (smsBannerUntil && state.elapsed > smsBannerUntil) {
    smsBannerUntil = 0;
    hideSmsBanner();
  }
}
function updateUI() {
  syncTouchControls();
  document.body.dataset.phase = state.phase;
  const race = state.race;
  $("race-clock").textContent = formatTime(race.elapsed);
  const dialogClock = document.getElementById("dialog-race-clock");
  if (dialogClock) dialogClock.textContent = formatTime(race.elapsed);
  $("race-status").textContent = race.practice
    ? "PRACTICE RUN"
    : !race.started
      ? "MOVE TO START"
      : state.phase === "complete"
        ? "DELIVERY COMPLETE"
        : "ON THE CLOCK";
  $("race-hud").classList.toggle(
    "clock-running",
    race.started && state.phase !== "complete",
  );
  STAGES.forEach((_, i) => {
    const done = race.splits[i] !== undefined;
    const active = !done && i === race.splits.length;
    const row = $("race-stage-" + i);
    row.classList.toggle("stage-done", done);
    row.classList.toggle("stage-active", active);
    row.setAttribute(
      "aria-label",
      `${STAGES[i].short}: ${done ? "complete" : active ? "current stage" : "up next"}`,
    );
    row.querySelector(".stage-number")!.textContent = done
      ? "✓"
      : String(i + 1);
    $("race-split-" + i).textContent = done
      ? formatTime(race.splits[i] - (race.splits[i - 1] ?? 0))
      : active && race.started
        ? formatTime(race.elapsed - (race.splits[i - 1] ?? 0))
        : "—";
  });
  const o = objective(state),
    p = parking(state),
    d = docking(state),
    isWalking = walking(state);
  $("telemetry").classList.toggle("hidden", !started || isWalking);
  $("objective-title").textContent = o.title;
  $("objective-detail").textContent = o.detail;
  $("step-label").textContent =
    `0${Math.min(o.step + 1, 4)} / 04 · ${["ARRIVAL", "CHECK-IN", "ACCESS", "DELIVERY", "COMPLETE"][o.step]}`;
  document
    .querySelectorAll(".mission-progress i")
    .forEach((el, i) => el.classList.toggle("active", i <= o.step));
  $("speed").textContent = String(
    Math.round(Math.abs(state.truck.speed) * 3.6),
  ).padStart(2, "0");
  $("gear").textContent = isWalking
    ? "↟"
    : state.truck.speed < -0.05
      ? "R"
      : state.truck.speed > 0.05
        ? "D"
        : "N";
  $("assist-tag").innerHTML = state.assisted
    ? '<span class="live-dot"></span> REVERSE ASSIST'
    : "CLASSIC STEERING";
  const beta =
    (angle(state.truck.heading - state.truck.trailerHeading) * 180) / Math.PI;
  $("articulation-value").textContent = `${Math.round(Math.abs(beta))}°`;
  $("articulation-bar").style.width =
    `${Math.min((Math.abs(beta) / 65) * 100, 100)}%`;
  $("articulation-bar").style.background =
    Math.abs(beta) > 45 ? "#dc8444" : "#00a990";
  const action = prompt(state);
  $("action-wrap").classList.toggle(
    "hidden",
    !action || !started || settingsOpen,
  );
  $("action-text").textContent = action;
  $("target-symbol").textContent = ["P", "↟", "↗", "03", "✓"][o.step];
  $("target-name").textContent =
    state.phase === "walk-truck"
      ? "YOUR TRUCK"
      : [
          "HOLDING BAY P02",
          "DRIVER CHECK-IN",
          "ENTRY GATE",
          "DOCK 03",
          "DELIVERED",
        ][o.step];
  const slow = slowDown(state);
  $("target-label").classList.toggle("slow", slow);
  $("target-distance").textContent = slow
    ? "Slow down"
    : `${Math.round(distance(isWalking ? state.driver : state.truck, o.target))} m away`;
  $("toast").textContent = state.message;
  $("toast").classList.toggle(
    "hidden",
    state.elapsed > state.messageUntil || !state.message || settingsOpen,
  );
  $("cli-resume").classList.toggle("hidden", !cliPaused);
  syncSms();
  const sms = smsReceived(state);
  $("note-label").textContent = sms ? "SMS FROM PERIPASS" : "YOUR DELIVERY";
  $("delivery-reference").textContent = sms
    ? `PIN ${state.pin} → Dock 03`
    : `${state.booking} → Ghent`;
  $("note-detail").textContent = sms
    ? "Gate access code"
    : "Registration reference";
  $("stage-hint").textContent =
    state.phase === "arrive"
      ? p.ready
        ? "Parked. Press E to exit."
        : p.inside
          ? "Release the accelerator to stop."
          : "Start with W / ↑. Release to slow down."
      : state.phase === "dock"
        ? "Reverse assist: aim the trailer with A / D."
        : isWalking
          ? "WASD / arrows to walk. E to interact."
          : "Follow the marked lane to the gate.";
  $("dock-guide").classList.toggle(
    "hidden",
    state.phase !== "dock" || !started,
  );
  $("dock-offset").textContent = `${d.lateral.toFixed(1)} m`;
  $("dock-angle").textContent = `${d.angleDegrees.toFixed(0)}°`;
  $("dock-gap").textContent = d.gap > 0 ? `${d.gap.toFixed(1)} m` : "At bumper";
  $("dock-needle").style.left =
    `${50 + Math.max(-47, Math.min(47, rear(state.truck).x * 10))}%`;
  $("dock-coach").textContent =
    d.angleDegrees > 90
      ? "Turn the cab away."
      : d.ready
        ? "Hold position."
        : d.lateral > 0.85
          ? "Line up your trailer."
          : d.angleDegrees > 6
            ? "Straighten the trailer."
            : d.gap < 2
              ? "Brake at the bumper."
              : "Reverse slowly.";
  $("dock-tip").textContent =
    d.angleDegrees > 90
      ? "The back of the trailer goes against the dock. Use the open apron to turn around."
      : "Hold Shift for a slow approach. Release steering to let the trailer straighten.";
  drawMap();
  syncDialog();
}
// Runs every rendered frame, not on the throttled UI tick, so the label tracks
// the camera as smoothly as the 3D marker. Positions snap to device pixels:
// fractional offsets re-rasterise the text each frame and make it shimmer.
function placeTargetLabel() {
  const label = $("target-label"),
    screen = scene.project(objective(state).target),
    dpr = devicePixelRatio || 1,
    x = Math.round(screen.x * dpr) / dpr,
    y = Math.round(screen.y * dpr) / dpr;
  label.classList.toggle(
    "hidden",
    !started ||
      !screen.visible ||
      !!prompt(state) ||
      state.phase === "complete" ||
      settingsOpen,
  );
  label.style.transform = `translate(${x}px,${y}px) translate(-50%,-115%)`;
}
function frame(now: number) {
  const wallDelta = Math.max(0, (now - last) / 1000);
  if (started && !cliPaused) tickRace(state.race, wallDelta);
  const dt = Math.min(wallDelta, 0.05);
  last = now;
  const input = currentInput(),
    paused = settingsOpen || leaderboardOpen || cliPaused || document.hidden;
  const pad = navigator.getGamepads?.().find((g) => g?.connected),
    pressed = !!pad?.buttons[0]?.pressed;
  if (pressed && !lastGamepadAction && started && !paused) {
    interact(state);
    syncDialog();
  }
  lastGamepadAction = pressed;
  // Holding X for a second jumps to the next place to act: kiosk, gate line, dock.
  // Playtest aid, deliberately unlisted.
  const holdingSkip =
    started &&
    !paused &&
    keys.has("x") &&
    !Object.values(bindings).includes("x");
  if (!holdingSkip) skipHeldSince = 0;
  else if (!skipHeldSince) skipHeldSince = now;
  else if (now - skipHeldSince >= 1000) {
    skipHeldSince = Infinity;
    skipAhead(state);
  }
  if (started && !paused) {
    accumulator += dt;
    while (accumulator >= DT) {
      step(state, input, DT, false);
      accumulator -= DT;
    }
  } else accumulator = 0;
  scene.render(state, input, dt, started);
  placeTargetLabel();
  if (audio && engine && engineGain) {
    engine.frequency.setTargetAtTime(
      38 + Math.abs(state.truck.speed) * 10,
      audio.currentTime,
      0.1,
    );
    engineGain.gain.setTargetAtTime(
      soundEnabled && started && !paused && !walking(state)
        ? 0.013 + Math.abs(state.truck.speed) * 0.002
        : 0,
      audio.currentTime,
      0.1,
    );
    if (soundEnabled && state.truck.speed < -0.1 && now - lastBeep > 1200) {
      beep(520);
      lastBeep = now;
    }
  }
  if (now - uiTick > 80) {
    uiTick = now;
    updateUI();
  }
  requestAnimationFrame(frame);
}
async function control(command: unknown) {
  const c = command as { op?: string };
  if (!scene.loaded) throw new Error("The yard is still loading.");
  if (!started && c?.op !== "status") start();
  if (c?.op === "resume") {
    cliPaused = false;
    return { ok: true, state: snapshot(state) };
  }
  if (c?.op === "pause") {
    cliPaused = true;
    return { ok: true, state: snapshot(state) };
  }
  if (c?.op === "screenshot") {
    scene.render(state, idleInput(), 1 / 60, started);
    return {
      ok: true,
      image: scene.renderer.domElement.toDataURL("image/png"),
    };
  }
  if (c?.op !== "status") {
    cliPaused = true;
    settingsOpen = false;
    clearInput();
  }
  const result = execute(state, command);
  updateUI();
  // Finish rendering the same state before replying. No source-evaluation back door.
  scene.render(state, idleInput(), 1 / 30, started);
  await new Promise(requestAnimationFrame);
  return { ok: true, state: result };
}
if (import.meta.hot) {
  import.meta.hot.on("yard:command", async ({ id, command }) => {
    try {
      const result = await control(command);
      import.meta.hot!.send("yard:result", { id, result });
    } catch (e) {
      import.meta.hot!.send("yard:result", {
        id,
        result: { ok: false, error: (e as Error).message },
      });
    }
  });
}
// A small WebMCP surface lets supported browsers inspect and play through normal controls.
type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => unknown;
};
const context = (document as Document & { modelContext?: ModelContext })
  .modelContext;
const toolLifecycle = new AbortController();
if (context?.registerTool) {
  for (const tool of [
    {
      name: "yard_status",
      description:
        "Read the current truck pose, mission, parking and docking measurements.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => snapshot(state),
    },
    {
      name: "yard_control",
      description:
        "Drive or walk in the Peripass yard through the same controls as the visitor. Commands: reset, input, interact, register, pin, recover, assist, drive-to, walk-to, demo. Input durations are seconds. Does not contact a real logistics system.",
      inputSchema: {
        type: "object",
        properties: {
          op: {
            type: "string",
            enum: [
              "reset",
              "input",
              "interact",
              "register",
              "pin",
              "recover",
              "assist",
              "drive-to",
              "walk-to",
              "demo",
            ],
          },
          throttle: { type: "number", minimum: -1, maximum: 1 },
          steer: { type: "number", minimum: -1, maximum: 1 },
          seconds: { type: "number", minimum: 0, maximum: 120 },
          brake: { type: "boolean" },
          precision: { type: "boolean" },
          walkX: { type: "number" },
          walkZ: { type: "number" },
          x: { type: "number" },
          z: { type: "number" },
          booking: { type: "string" },
          pin: { type: "string" },
          enabled: { type: "boolean" },
          reverse: { type: "boolean" },
        },
        required: ["op"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: control,
    },
  ]) {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: toolLifecycle.signal }),
      ).catch((e) => console.warn("Yard tools unavailable", e));
    } catch (e) {
      console.warn("Yard tools unavailable", e);
    }
  }
}
import.meta.hot?.dispose(() => toolLifecycle.abort());
scene
  .load()
  .then(() => {
    $("start").innerHTML = "Let’s drive <span>↗</span>";
    $("start").removeAttribute("disabled");
    import.meta.hot?.send("yard:ready", {});
  })
  .catch((error) => {
    $("start").textContent = "Loading failed · reload to retry";
    console.error(error);
  });
requestAnimationFrame(frame);
