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
import "./dispatch/dispatch.css";
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
  DOCK_TOLERANCE,
  angle,
  register,
  dispatch,
  dockLabel,
  dockX,
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
  blendPoint,
  blendTruck,
  type Input,
  type Point,
  type State,
  type Truck,
} from "./game/simulation";
import { execute } from "./game/commands";
import { mountKiosk, type KioskController } from "./kiosk/view";
import { mountDispatch, type DispatchController } from "./dispatch/view";
import { clock, phoneHtml, smsBannerHtml } from "./sms";
import { flags } from "./kiosk/icons";
import {
  LANGUAGES,
  isLang,
  language,
  resolveLanguage,
  setLanguage,
  t,
  type Lang,
  type StringKey,
} from "./i18n";
import { walkingJoystick } from "./walking-joystick";
import { sendFeedback } from "./feedback";
import {
  STAGES,
  formatTime,
  stageName,
  stageShort,
  stageTimes,
  tickRace,
  type Race,
} from "./game/race";
import {
  createLeaderboard,
  resultFromRace,
  cleanName,
  sectionBoard,
  sectionSeconds,
  type Result,
} from "./game/leaderboard";
import { createConvexLeaderboard } from "./leaderboard-convex";
import {
  identifyBest,
  initAnalytics,
  observe,
  setControls,
  trackAction,
} from "./analytics";
initAnalytics();
const convexUrl: string | undefined = import.meta.env?.VITE_CONVEX_URL;
const leaderboard = convexUrl
  ? createConvexLeaderboard(convexUrl)
  : createLeaderboard(() => localStorage);
const shared = leaderboard.shared;
/** Copy that differs between the shared (Convex) and the local board. */
const board = (global: StringKey, local: StringKey) =>
  t(shared ? global : local);
// The game speaks the language the player picked last time, else the first
// browser language the kiosk also offers. The kiosk keeps its own language step.
const LANGUAGE_KEY = "yard-language";
function savedLanguage(): Lang | undefined {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    return isLang(saved) ? saved : undefined;
  } catch {
    return undefined;
  }
}
setLanguage(
  savedLanguage() ??
    resolveLanguage(navigator.languages ?? [navigator.language]),
);
document.documentElement.lang = language();
let langMenuOpen = false;
let leaderboardOpen = false;
let feedbackOpen = false,
  feedbackSource: "topbar" | "results" = "topbar",
  feedbackCloseTimer = 0;
let completedRace: Race | undefined;
let completedResult: Result | undefined;
let savedResultId = "";
let openSplit = -1;
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
<header class="topbar"><a class="brand" href="/" aria-label="Peripass"><img src="/brand/peripass.svg" alt="Peripass"/></a><div class="top-actions"><div class="lang-control"><button id="language" class="lang-button" aria-haspopup="listbox" aria-expanded="false"></button><div id="language-menu" class="lang-menu" role="listbox" hidden></div></div><button id="leaderboard-button" class="leaderboard-button">♛ <span data-t="topbar.leaderboard"></span></button><button id="feedback" class="feedback-button" data-t="topbar.feedback" data-t-title="topbar.feedbackTitle"></button><button id="camera" class="icon-button">◩</button><button id="help" class="icon-button" data-t-aria="topbar.helpAria" data-t-title="topbar.helpTitle">?</button></div></header>
<section id="intro" class="intro panel"><div id="intro-languages" class="intro-languages" role="radiogroup"></div><div class="race-kicker" data-t="intro.kicker"></div><h1 data-t-html="intro.title"></h1><p data-t="intro.tagline"></p><div class="intro-stages">${STAGES.map((stage, i) => `<span><b>0${i + 1}</b><span data-t="stage.${stage.key}.short"></span></span>`).join("")}</div><button id="start" class="primary" disabled></button><small class="race-intro-note" data-t="intro.note"></small><div id="intro-best" class="intro-best"></div></section>
<section id="race-hud" class="race-hud hidden" data-t-aria="race.progressAria"><div class="race-clock-row"><div><span class="race-kicker" id="race-status"></span><strong id="race-clock" role="timer" data-t-aria="race.elapsedAria">00:00.00</strong></div><div class="race-best"><span id="race-best-label"></span><b id="race-best">—</b></div></div><ol class="race-stages">${STAGES.map((stage, i) => `<li id="race-stage-${i}"><span class="stage-number">${i + 1}</span><span data-t="stage.${stage.key}.short"></span><b id="race-split-${i}">—</b></li>`).join("")}</ol></section>
<aside id="mission" class="mission panel hidden"><div class="eyebrow" id="step-label"></div><h1 id="objective-title"></h1><p id="objective-detail"></p><div class="mission-progress"><i></i><i></i><i></i><i></i></div><div class="delivery-note"><span id="note-label"></span><b id="delivery-reference">${BOOKING} <span>→</span> ${t("mission.city")}</b><small id="note-detail"></small></div><div id="stage-hint" class="stage-hint"></div></aside>
<button id="map-button" class="minimap panel hidden" data-t-aria="map.showAria"><div><span data-t="map.title"></span><span>↗</span></div><canvas id="map" width="340" height="270" data-t-aria="map.canvasAria"></canvas><span class="map-key"><i></i> <small data-t="map.you"></small> <b>◎</b> <small data-t="map.destination"></small> <span class="map-north">N ↑</span></span></button>
<div id="target-label" class="target-label hidden"><span id="target-symbol" class="target-number">P</span><div><b id="target-name"></b><small id="target-distance"></small></div></div>
<div id="action-wrap" class="action-wrap hidden"><button id="interact" class="action"><kbd id="interact-key">E</kbd><span id="action-text"></span><span>↗</span></button></div>
<div id="toast" role="status" aria-live="polite" class="toast hidden"></div>
<div id="sms-banner" role="status" aria-live="polite" class="sms-banner hidden" data-t-title="sms.dismiss"></div>
<button id="cli-resume" class="cli-resume hidden">CLI control · Resume ↗</button>
<footer class="bottom-bar"><div class="controls-hint" id="controls-hint"></div></footer>
<div id="dock-guide" class="dock-guide panel hidden"><div class="eyebrow" data-t="dock.eyebrow"></div><strong id="dock-coach"></strong><div class="dock-measure"><span data-t="dock.offset"></span><b id="dock-offset"></b></div><div class="dock-meter"><i id="dock-needle"></i><span></span></div><div class="dock-measure"><span data-t="dock.angle"></span><b id="dock-angle"></b></div><div class="dock-measure"><span data-t="dock.gap"></span><b id="dock-gap"></b></div><p id="dock-tip"></p></div>
<div id="telemetry" class="telemetry panel hidden"><div class="gear"><b id="gear">N</b><span data-t="tele.auto"></span></div><div class="speed"><b id="speed">00</b><span data-t="tele.kmh"></span></div><div id="assist-tag" class="assist-tag"></div><div class="articulation"><span data-t="tele.trailer"></span><div><i id="articulation-bar"></i></div><b id="articulation-value">0°</b></div></div>
<div id="touch-controls"><div class="touch-group"><button data-touch="left" data-t-aria="touch.left">←</button><button data-touch="right" data-t-aria="touch.right">→</button></div><div class="touch-group pedals"><button data-touch="reverse" data-t-aria="touch.reverseAria">↓<small data-t="touch.reverse"></small></button><button data-touch="forward" data-t-aria="touch.forwardAria">↑<small data-t="touch.drive"></small></button><button data-touch="brake" data-t-aria="touch.brake">■</button></div><div id="walk-joystick" class="walking-joystick" role="group" data-t-aria="touch.joystick" hidden><span class="joystick-knob"></span></div></div>
<div class="letterbox" aria-hidden="true"><i></i><i></i></div>
<div id="dispatch-root"></div>
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
  app.innerHTML = `<div class="fallback"><h1>${t("webgl.title")}</h1><p>${t("webgl.body")}</p><button onclick="location.reload()">${t("webgl.retry")}</button></div>`;
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
/** Bound key labels for copy that names them. */
const keyVars = () =>
  Object.fromEntries(
    Object.entries(bindings).map(([action, key]) => [action, keyLabel(key)]),
  );
function updateKeyHints() {
  $("controls-hint").replaceChildren();
  for (const [actions, label] of [
    [["forward", "reverse"], t("controls.drive")],
    [["left", "right"], t("controls.steer")],
    [["brake"], t("controls.brake")],
    [["precision"], t("controls.precision")],
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
  $("camera").title = t("topbar.cameraTitle", {
    key: keyLabel(bindings.camera),
  });
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
let loadState: "loading" | "ready" | "failed" = "loading";
function syncStartButton() {
  const button = $("start");
  button.innerHTML =
    loadState === "failed"
      ? t("intro.loadFailed")
      : `${t(loadState === "ready" ? "intro.start" : "intro.loading")} <span>↗</span>`;
  button.toggleAttribute("disabled", loadState !== "ready");
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
function currentInput(gamepad?: Gamepad): Input {
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
  if (gamepad && !settingsOpen) {
    if (Math.abs(gamepad.axes[0]) > 0.15) i.steer = -gamepad.axes[0];
    const pedal =
      (gamepad.buttons[7]?.value ?? 0) - (gamepad.buttons[6]?.value ?? 0);
    if (Math.abs(pedal) > 0.05) i.throttle = pedal;
    if (i.steer || i.throttle) setControls("gamepad");
    i.brake ||= !!gamepad.buttons[1]?.pressed;
  }
  i.walkX = -i.steer;
  i.walkZ = -i.throttle;
  if (walking(state) && (joystick.value.x || joystick.value.z)) {
    setControls("touch");
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
  trackAction("leaderboard_opened", state, { started });
  syncDialog();
};
const cameraName = () =>
  t(
    scene.mode === "follow"
      ? "camera.follow"
      : scene.mode === "yard"
        ? "camera.yard"
        : "camera.overhead",
  );
const syncCameraButton = () =>
  $("camera").setAttribute(
    "aria-label",
    t("camera.aria", { camera: cameraName() }),
  );
$("camera").onclick = () => {
  scene.mode =
    scene.mode === "follow"
      ? "yard"
      : scene.mode === "yard"
        ? "overhead"
        : "follow";
  syncCameraButton();
  note(state, cameraName());
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
function openFeedback(source: "topbar" | "results") {
  feedbackOpen = true;
  feedbackSource = source;
  keys.clear();
  syncDialog();
}
$("feedback").onclick = () => openFeedback("topbar");
// Language: a flag button in the top bar opens a list; the start screen shows
// the same six languages as chips so nobody has to hunt for it.
const flag = (code: string) => flags[code].replace("kiosk-flag", "lang-flag");
function renderLanguageControls() {
  const lang = language();
  const current = LANGUAGES.find((l) => l.code === lang)!;
  const button = $("language");
  button.innerHTML = `${flag(current.flag)}<span class="lang-code">${lang.toUpperCase()}</span>`;
  button.setAttribute(
    "aria-label",
    t("language.current", { language: current.native }),
  );
  button.setAttribute("aria-expanded", String(langMenuOpen));
  const menu = $("language-menu");
  menu.hidden = !langMenuOpen;
  // The top bar sits below the race HUD; lift it while the list is open.
  document.body.classList.toggle("lang-open", langMenuOpen);
  menu.setAttribute("aria-label", t("language.label"));
  menu.innerHTML = LANGUAGES.map(
    (l) =>
      `<button type="button" role="option" data-lang="${l.code}" lang="${l.code}" aria-selected="${l.code === lang}">${flag(l.flag)}<span>${l.native}</span></button>`,
  ).join("");
  const chips = $("intro-languages");
  chips.setAttribute("aria-label", t("language.choose"));
  // Narrow phones show flag + code; everywhere else the language's own name.
  chips.innerHTML = LANGUAGES.map(
    (l) =>
      `<button type="button" class="lang-chip" role="radio" data-lang="${l.code}" lang="${l.code}" aria-label="${l.native}" aria-checked="${l.code === lang}">${flag(l.flag)}<span class="lang-chip-name">${l.native}</span><b class="lang-chip-code">${l.code.toUpperCase()}</b></button>`,
  ).join("");
}
function closeLanguageMenu() {
  if (!langMenuOpen) return;
  langMenuOpen = false;
  renderLanguageControls();
}
function chooseLanguage(code: string, source: "topbar" | "intro") {
  if (!isLang(code)) return;
  langMenuOpen = false;
  if (code === language()) {
    renderLanguageControls();
    return;
  }
  setLanguage(code);
  try {
    localStorage.setItem(LANGUAGE_KEY, code);
  } catch {
    /* the choice still holds for this visit */
  }
  trackAction("language_changed", state, { language: code, source });
  applyLanguage();
}
$("language").onclick = () => {
  langMenuOpen = !langMenuOpen;
  renderLanguageControls();
  if (langMenuOpen)
    $("language-menu")
      .querySelector<HTMLElement>('[aria-selected="true"]')
      ?.focus();
};
$("language-menu").onclick = (e) => {
  const option = (e.target as Element).closest<HTMLElement>("[data-lang]");
  if (option) {
    chooseLanguage(option.dataset.lang!, "topbar");
    $("language").focus();
  }
};
$("intro-languages").onclick = (e) => {
  const chip = (e.target as Element).closest<HTMLElement>("[data-lang]");
  if (chip) chooseLanguage(chip.dataset.lang!, "intro");
};
document.addEventListener("pointerdown", (e) => {
  if (langMenuOpen && !(e.target as Element).closest?.(".lang-control"))
    closeLanguageMenu();
});
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
    setControls("touch");
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
  feedbackOpen = false;
  clearTimeout(feedbackCloseTimer);
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
  if (langMenuOpen) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeLanguageMenu();
      $("language").focus();
    }
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
  if (k === bindings.recover && started) {
    recover(state);
    trackAction("recover_used", state);
  }
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
/** The camera is with the yard operator, or on its way there or back. */
const operatorBusy = () => scene.attention === "operator" || scene.cutting;
function syncTouchControls() {
  const isWalking = walking(state);
  const enabled =
    started &&
    !settingsOpen &&
    !leaderboardOpen &&
    !cliPaused &&
    !document.hidden &&
    !operatorBusy() &&
    !["kiosk", "pin", "dispatch", "complete"].includes(state.phase);
  if (isWalking === touchWalking && enabled === touchEnabled) return;
  clearInput();
  touchWalking = isWalking;
  touchEnabled = enabled;
  $("touch-controls").hidden = !enabled;
  $("touch-controls").setAttribute(
    "aria-label",
    t(isWalking ? "touch.walking" : "touch.driving"),
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
    `<div class="modal-scrim"><section class="dialog ${cls}" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1"><button class="dialog-close" id="close-dialog" aria-label="${t("dialog.close")}">×</button><div class="eyebrow">PERIPASS${state.race.started && state.phase !== "complete" ? `<span id="dialog-race-clock" class="dialog-race-clock" role="timer" aria-label="${t("race.elapsedAria")}">${formatTime(state.race.elapsed)}</span>` : ""}</div><h2 id="dialog-title">${title}</h2>${body}</section></div>`;
  $("close-dialog").onclick = closeDialog;
  clearInput();
  // Move focus onto the dialog itself, not its first control, so nothing
  // lights up on open while Escape and the Tab trap keep working.
  $("modal-root")
    .querySelector<HTMLElement>(".dialog")
    ?.focus({ preventScroll: true });
}
function syncDialog() {
  const kind = feedbackOpen
    ? "feedback"
    : leaderboardOpen
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
  if (kind === "feedback") {
    modal(
      t("fb.title"),
      `<p class="dialog-description">${t("fb.description")}</p><form id="feedback-form" class="feedback-form"><label class="field">${t("fb.label")}<textarea id="feedback-message" rows="5" maxlength="2000" placeholder="${t("fb.placeholder")}" required></textarea></label><label class="field"><span>${t("fb.email")} <small>${t("fb.emailHint")}</small></span><input id="feedback-email" type="email" autocomplete="email" placeholder="you@example.com" maxlength="120"/></label><div id="form-error" class="form-error" role="alert"></div><div class="dialog-buttons"><button class="primary" type="submit">${t("fb.send")} <span>↗</span></button><button type="button" id="feedback-cancel" class="text-button">${t("fb.cancel")}</button></div></form><p id="feedback-thanks" class="feedback-thanks hidden" role="status"><b>${t("fb.thanksTitle")}</b>${t("fb.thanksBody")}</p>`,
      "feedback-dialog",
    );
    $("feedback-cancel").onclick = closeDialog;
    $("feedback-message").focus({ preventScroll: true });
    $("feedback-form").onsubmit = async (event) => {
      event.preventDefault();
      const form = $("feedback-form") as HTMLFormElement,
        error = $("form-error"),
        button = form.querySelector("button")!;
      const message = ($("feedback-message") as HTMLTextAreaElement).value;
      const email = ($("feedback-email") as HTMLInputElement).value;
      if (!message.trim()) {
        error.textContent = t("fb.empty");
        return;
      }
      button.disabled = true;
      error.textContent = "";
      try {
        await sendFeedback({
          message,
          email,
          source: feedbackSource,
          phase: state.phase,
        });
      } catch (e) {
        button.disabled = false;
        error.textContent = t("fb.failed");
        console.error(e);
        return;
      }
      trackAction("feedback_sent", state, { source: feedbackSource });
      form.classList.add("hidden");
      $("feedback-thanks").classList.remove("hidden");
      $("close-dialog").focus();
      feedbackCloseTimer = window.setTimeout(() => {
        if (feedbackOpen) closeDialog();
      }, 1800);
    };
  } else if (kind === "leaderboard") {
    modal(
      t("lb.title"),
      `<p class="dialog-description">${board("lb.descGlobal", "lb.descLocal")}</p><div id="leaderboard-list"></div><p class="local-note">${board("lb.noteGlobal", "lb.noteLocal")}</p><button id="back-to-yard" class="primary">${t("lb.back")} <span>↗</span></button>`,
      "leaderboard-dialog",
    );
    renderLeaderboard();
    $("back-to-yard").onclick = closeDialog;
  } else if (kind === "settings") {
    modal(
      t("set.title"),
      `<p class="dialog-description">${t("set.description")}</p>
      <label class="setting-row"><span><b>${t("set.assist")}</b><small>${t("set.assistHint")}</small></span><input id="assist-setting" type="checkbox" ${state.assisted ? "checked" : ""}/></label>
      <label class="setting-row"><span><b>${t("set.sound")}</b><small>${t("set.soundHint")}</small></span><input id="sound-setting" type="checkbox" ${soundEnabled ? "checked" : ""}/></label>
      <label class="setting-row"><span><b>${t("set.motion")}</b><small>${t("set.motionHint")}</small></span><input id="motion-setting" type="checkbox" ${reducedMotion ? "checked" : ""}/></label>
      <div class="controls-title">${t("set.controlsTitle")} <span>${t("set.controlsHint")}</span></div><div class="keybindings" id="keybindings"></div>
      <p class="settings-tip">${t("set.tip", keyVars())}</p>
      <div class="dialog-buttons"><button id="resume" class="primary">${t("set.resume")} <span>↗</span></button><button id="recover" class="secondary">${t("set.recover")}</button><button id="restart" class="text-button">${t("set.restart")}</button></div>`,
      "settings-dialog",
    );
    for (const [action, key] of Object.entries(bindings)) {
      const label = document.createElement("span");
      const name = t(`action.${action}` as StringKey);
      label.textContent = name;
      const button = document.createElement("button");
      button.className = "keybind";
      button.textContent =
        remapping === action ? t("set.pressKey") : keyLabel(key);
      button.setAttribute(
        "aria-label",
        t("set.remapAria", { action: name, key: keyLabel(key) }),
      );
      button.onclick = () => {
        remapping = action;
        button.textContent = t("set.pressKey");
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
      trackAction("recover_used", state);
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
      strip.innerHTML = `<span data-t="kiosk.strip">${t("kiosk.strip")}</span><b id="dialog-race-clock" role="timer" aria-label="${t("race.elapsedAria")}">${formatTime(state.race.elapsed)}</b>`;
      kioskStage.append(strip);
    }
  } else if (kind === "pin") {
    // The driver reads the SMS on their phone and types the PIN into the gate terminal.
    modal(
      t("pin.title"),
      `<p class="dialog-description">${t("pin.description")}</p><div class="gate-layout"><div class="phone-peek">${phoneHtml(state.booking, state.pin, smsClock || clock(), state.dock)}</div><form id="pin-form" class="gate-terminal"><div class="eyebrow"><span class="live-dot"></span> ${t("pin.terminal")}</div><label class="field">${t("pin.label")}<input id="pin-input" inputmode="none" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="— — — —" aria-label="${t("pin.aria")}" required /></label><div class="pin-grid">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "⌫"].map((k) => `<button type="button" data-pin="${k}" aria-label="${k === "⌫" ? t("pin.delete") : k === "Clear" ? t("pin.clear") : k}">${k === "Clear" ? t("pin.clear") : k}</button>`).join("")}</div><div id="form-error" class="form-error" role="alert"></div><button class="primary" type="submit">${t("pin.open")} <span>↗</span></button></form></div>`,
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
        trackAction("pin_rejected", state);
        $("form-error").textContent = state.message;
        ($("pin-input") as HTMLInputElement).select();
      }
    };
  } else {
    if (completedRace !== state.race) {
      completedRace = state.race;
      completedResult = resultFromRace(state.race, state);
      openSplit = -1;
      beep(880);
    }
    const result = completedResult!;
    const best = leaderboard.list()[0];
    const eligible =
      !state.race.practice && result.splits.length === STAGES.length;
    const newBest = eligible && (!best || result.seconds < best.seconds);
    const saved = savedResultId === result.id;
    modal(
      newBest
        ? t("res.titleBest")
        : eligible
          ? t("res.titleDone")
          : t("res.titlePractice"),
      `<div class="finish-stripe" aria-hidden="true"></div><div class="result-badge">${!eligible ? t("res.badgePractice") : newBest ? board("res.badgeBestGlobal", "res.badgeBestLocal") : t("res.badgeComplete")}</div><div class="result-time">${formatTime(result.seconds)}</div><p class="result-comparison">${!eligible ? t("res.tryFull") : !best ? t("res.firstRun") : newBest ? t(shared ? "res.fasterGlobal" : "res.fasterLocal", { time: formatTime(best.seconds - result.seconds) }) : t(shared ? "res.offGlobal" : "res.offLocal", { time: formatTime(result.seconds - best.seconds) })}</p><div id="result-splits"></div><div class="result-stats"><span>${t("res.contacts", { n: result.contacts })}</span><span>${t("res.recoveries", { n: result.recoveries })}</span><span>${t(result.assisted ? "res.assistOn" : "res.classic")}</span></div><form id="score-form" class="score-form ${saved || !eligible ? "hidden" : ""}"><label for="player-name">${t("res.nameLabel")}</label><div><input id="player-name" maxlength="24" placeholder="${t("res.namePlaceholder")}" autocomplete="nickname" required aria-describedby="save-status"/><button class="primary" type="submit">${t("res.save")} <span>↗</span></button></div></form><p id="save-status" class="local-note" role="status">${!eligible ? t("res.practiceNote") : saved ? t("res.onBoard") : board("res.saveGlobal", "res.saveLocal")}</p><div class="result-board-title"><b>${t("res.legends")}</b><span>${board("res.top5Global", "res.top5Local")}</span></div><div id="leaderboard-list"></div><button id="play-again" class="primary play-again">${t("res.again")} <span>↻</span></button><button id="results-feedback" class="secondary results-feedback">${t("res.feedback")}</button>`,
      "complete-dialog race-results",
    );
    $("results-feedback").onclick = () => openFeedback("results");
    $("close-dialog").classList.add("hidden");
    renderLeaderboard(result.id, 5);
    renderSplits();
    $("score-form").onsubmit = async (event) => {
      event.preventDefault();
      if (!eligible || savedResultId === result.id) return;
      const input = $("player-name") as HTMLInputElement;
      const name = cleanName(input.value);
      if (!name) {
        input.setCustomValidity(t("res.enterName"));
        input.reportValidity();
        return;
      }
      savedResultId = result.id;
      const form = $("score-form"),
        status = $("save-status");
      form.querySelector("button")!.disabled = true;
      status.textContent = t("res.saving");
      try {
        const saved = await leaderboard.save({ ...result, name });
        trackAction("score_saved", state, {
          rank: saved.rank,
          persisted: saved.persisted,
          best: saved.rank === 1,
        });
        identifyBest(leaderboard.list()[0]?.seconds ?? result.seconds);
        form.classList.add("hidden");
        status.textContent = `${t("res.rank", { rank: saved.rank })} ${
          !saved.persisted
            ? t("res.noStorage")
            : saved.rank > 100
              ? t("res.only100")
              : board("res.savedGlobal", "res.savedLocal")
        }`;
      } catch (error) {
        savedResultId = "";
        form.querySelector("button")!.disabled = false;
        status.textContent =
          error instanceof Error && !/Server Error/i.test(error.message)
            ? error.message
            : t("res.saveFailed");
        return;
      }
      if (document.getElementById("leaderboard-list"))
        renderLeaderboard(result.id, 5);
      renderSplits();
      refreshBest();
      document.getElementById("play-again")?.focus();
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
  }
}
function refreshBest() {
  const best = leaderboard.list()[0];
  $("race-best").textContent = best ? formatTime(best.seconds) : "—";
  $("intro-best").textContent = best
    ? t("intro.timeToBeat", { time: formatTime(best.seconds), name: best.name })
    : t("intro.fresh");
}
function renderLeaderboard(highlight = "", limit = 100) {
  const rows = leaderboard.list();
  const root = $("leaderboard-list");
  root.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "leaderboard-empty";
    empty.textContent = t("lb.empty");
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
    meta.textContent = `${t("lb.meta", { contacts: row.contacts, recoveries: row.recoveries, mode: t(row.assisted ? "lb.assist" : "lb.classic") })}${row.id === highlight ? ` · ${t("lb.you")}` : ""}`;
    name.append(meta);
    const time = document.createElement("b");
    time.textContent = formatTime(row.seconds);
    li.append(position, name, time);
    ol.append(li);
  }
  root.append(ol);
}
/** Stage rows on the results screen: your section rank at a glance, tap for that section's board. */
function renderSplits() {
  const result = completedResult;
  const root = document.getElementById("result-splits");
  if (!result || !root) return;
  const eligible =
    !completedRace?.practice && result.splits.length === STAGES.length;
  const rows = leaderboard.list();
  const ol = document.createElement("ol");
  ol.className = "result-splits";
  STAGES.forEach((stage, i) => {
    const entries = sectionBoard(rows, i, eligible ? result : undefined);
    const own = entries.find((entry) => entry.result.id === result.id);
    const seconds = sectionSeconds(result, i);
    const open = openSplit === i;
    const label = stageTimes(stage.key);
    const name = stageName(stage.key);
    const li = document.createElement("li");
    li.classList.toggle("split-open", open);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "split-toggle";
    toggle.id = `split-toggle-${i}`;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-controls", `split-board-${i}`);
    // Rank only means something once there is someone to compare with.
    const ranked = own && entries.length > 1 ? own : undefined;
    const time = seconds === undefined ? "—" : formatTime(seconds);
    const rank = ranked
      ? `<span class="${["split-rank", ranked.rank === 1 ? "rank-first" : ranked.rank <= 3 ? "rank-podium" : ""].join(" ").trim()}">#${ranked.rank}</span>`
      : "";
    toggle.innerHTML = `<span class="stage-number">✓</span><span class="split-name">${name}</span>${rank}<b>${time}</b><span class="split-chevron" aria-hidden="true"></span>`;
    toggle.setAttribute(
      "aria-label",
      ranked
        ? t("res.rankedAria", {
            stage: name,
            time,
            rank: ranked.rank,
            total: entries.length,
          })
        : t("res.splitAria", { stage: name, time }),
    );
    toggle.onclick = () => {
      openSplit = open ? -1 : i;
      if (!open)
        trackAction("section_board_opened", state, {
          stage: stage.key,
          rank: own?.rank ?? null,
          entries: entries.length,
        });
      renderSplits();
      $(`split-toggle-${i}`).focus({ preventScroll: true });
      if (!open)
        document.getElementById(`split-board-${i}`)?.scrollIntoView?.({
          block: "nearest",
          behavior: reducedMotion ? "auto" : "smooth",
        });
    };
    const panel = document.createElement("div");
    panel.className = "split-board";
    panel.id = `split-board-${i}`;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", t("res.fastest", { label }));
    panel.hidden = !open;
    if (open) {
      const title = document.createElement("div");
      title.className = "split-board-title";
      title.innerHTML = `<b>${t("res.fastest", { label })}</b><span>${board("res.top5Global", "res.top5Local")}</span>`;
      panel.append(title);
      if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "split-board-empty";
        empty.textContent = t("res.noneYet", { label });
        panel.append(empty);
      } else {
        const list = document.createElement("ol");
        list.className = "leaderboard-rows";
        const visible = entries.slice(0, 5);
        if (own && !visible.includes(own)) visible.push(own);
        const best = entries[0].seconds;
        for (const entry of visible) {
          const row = document.createElement("li");
          row.classList.toggle("your-result", entry === own);
          const position = document.createElement("span");
          position.className = "leaderboard-rank";
          position.textContent =
            entry.rank === 1 ? "♛" : String(entry.rank).padStart(2, "0");
          const name = document.createElement("span");
          name.className = "leaderboard-name";
          name.textContent = entry.result.name || t("lb.you");
          const meta = document.createElement("small");
          meta.textContent = `${entry.rank === 1 ? t("res.sectionBest") : `+${formatTime(entry.seconds - best)}`}${entry === own && entry.result.name ? ` · ${t("lb.you")}` : ""}`;
          name.append(meta);
          const time = document.createElement("b");
          time.textContent = formatTime(entry.seconds);
          row.append(position, name, time);
          list.append(row);
        }
        panel.append(list);
      }
    }
    li.append(toggle, panel);
    ol.append(li);
  });
  // Live board updates re-render the rows; keep keyboard focus on the same stage.
  const focused = document.activeElement?.id ?? "";
  root.replaceChildren(ol);
  if (focused.startsWith("split-toggle-"))
    document.getElementById(focused)?.focus({ preventScroll: true });
}
refreshBest();
function refreshBoard() {
  refreshBest();
  renderSplits();
  if (document.getElementById("leaderboard-list"))
    renderLeaderboard(
      completedResult?.id,
      state.phase === "complete" && !leaderboardOpen ? 5 : 100,
    );
}
window.addEventListener("storage", refreshBoard);
leaderboard.onChange(refreshBoard);
let mapKey = "";
function drawMap() {
  // A full redraw every UI tick repaints the panel even when nothing moved.
  // Redraw only once the truck, driver or destination shifts by a map pixel.
  const t = state.truck,
    o = objective(state);
  const key = [
    state.phase,
    o.target.x,
    o.target.z,
    Math.round(t.x * 10),
    Math.round(t.z * 10),
    Math.round(t.heading * 20),
    Math.round(t.trailerHeading * 20),
    Math.round(state.driver.x * 10),
    Math.round(state.driver.z * 10),
  ].join();
  if (key === mapKey) return;
  mapKey = key;
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
  const p = xy(o.target.x, o.target.z);
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
  banner.innerHTML = smsBannerHtml(state.booking, state.pin, state.dock);
  banner.style.transform = "";
  banner.classList.remove("hidden", "is-out", "is-dragging");
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
  if (
    banner.classList.contains("hidden") ||
    banner.classList.contains("is-out")
  )
    return;
  banner.classList.remove("is-in", "is-dragging");
  banner.classList.add("is-out");
  banner.style.transform = ""; // from wherever the finger left it, up and away
  clearTimeout(smsBannerTimer);
  smsBannerTimer = setTimeout(() => {
    banner.classList.remove("is-out");
    banner.classList.add("hidden");
  }, 400);
}
// Dismissing works as on a phone: the card follows a finger dragging it up and
// flies off once it has gone far or fast enough; a short drag springs back and a
// tap (or the hover-only close dot) sends it away too.
let smsDrag: {
  id: number;
  x0: number;
  y0: number;
  y: number;
  t: number;
  vy: number;
} | null = null;
{
  const banner = $("sms-banner");
  const onClose = (e: Event) =>
    (e.target as Element).closest(".sms-banner__close") !== null;
  banner.addEventListener("pointerdown", (e) => {
    if (smsDrag || onClose(e) || !banner.classList.contains("is-in")) return;
    smsDrag = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      y: e.clientY,
      t: e.timeStamp,
      vy: 0,
    };
    banner.setPointerCapture(e.pointerId);
    banner.classList.add("is-dragging");
  });
  banner.addEventListener("pointermove", (e) => {
    if (e.pointerId !== smsDrag?.id) return;
    const dt = e.timeStamp - smsDrag.t;
    if (dt > 0) smsDrag.vy = (e.clientY - smsDrag.y) / dt; // px per ms, latest segment
    smsDrag.y = e.clientY;
    smsDrag.t = e.timeStamp;
    const dy = e.clientY - smsDrag.y0;
    // Upward follows the finger; downward only rubber-bands a little.
    banner.style.transform = `translate(-50%, ${dy < 0 ? dy : dy * 0.15}px)`;
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId !== smsDrag?.id) return;
    const dx = e.clientX - smsDrag.x0;
    const dy = e.clientY - smsDrag.y0;
    const flick = dy < -36 || smsDrag.vy < -0.5;
    smsDrag = null;
    banner.classList.remove("is-dragging");
    const tap = e.type === "pointerup" && Math.hypot(dx, dy) < 8;
    if (tap || flick) hideSmsBanner();
    else banner.style.transform = ""; // not far enough: spring back into place
  };
  banner.addEventListener("pointerup", release);
  banner.addEventListener("pointercancel", release);
  banner.addEventListener("click", (e) => {
    if (onClose(e)) hideSmsBanner();
  });
}
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
  if (smsBannerUntil && state.elapsed > smsBannerUntil && !smsDrag) {
    smsBannerUntil = 0;
    hideSmsBanner();
  }
}
// The yard operator's turn. Two seconds after the driver leaves the kiosk the
// simulation holds the "dispatch" phase; the camera then cuts to the operator
// by dock 05, their phone comes up once it lands, and the camera cuts back
// when the phone is pocketed. Presentation only: the call-off itself is the
// simulation's dispatch(), which CLI sessions reach directly.
let dispatchUi: DispatchController | null = null,
  dispatchFor: State | null = null,
  operatorDone = false;
function pocketPhone(animated: boolean) {
  const ui = dispatchUi;
  dispatchUi = null;
  if (!ui) return;
  if (animated) void ui.dismiss();
  else ui.destroy();
}
function syncOperator() {
  const operatorTurn = state.phase === "dispatch";
  // A restart, a skip or a CLI call-off moved on without the phone: put it away.
  if (dispatchUi && (state !== dispatchFor || (!operatorTurn && !operatorDone)))
    pocketPhone(false);
  if (operatorTurn && scene.attention === "driver") scene.cutTo("operator");
  if (
    operatorTurn &&
    scene.attention === "operator" &&
    !scene.cutting &&
    !dispatchUi
  ) {
    dispatchFor = state;
    operatorDone = false;
    dispatchUi = mountDispatch($("dispatch-root"), {
      booking: state.booking,
      onDispatch: (dock) => {
        if (!dispatch(state, dock)) return state.message;
        operatorDone = true;
        trackAction("visitor_dispatched", state, { dock });
        return true;
      },
      onNotify: () => {
        beep(988);
        setTimeout(() => beep(1319), 120);
        try {
          navigator.vibrate?.([70, 50, 70]);
        } catch {
          /* no haptics */
        }
      },
      onClose: () => pocketPhone(true),
    });
  }
  if (!operatorTurn && scene.attention === "operator" && !dispatchUi)
    scene.cutTo("driver");
  scene.operatorPhone = dispatchUi !== null;
  document.body.classList.toggle("operator", operatorBusy());
  document.body.classList.toggle("cinematic", scene.cutting);
}
// Writing an unchanged string still replaces the text node and dirties style
// and layout for the panel, so the HUD only touches the DOM when a value moves.
const shown = new Map<string, string>();
function write(key: string, value: string, apply: () => void) {
  if (shown.get(key) === value) return;
  shown.set(key, value);
  apply();
}
const text = (id: string, value: string) =>
  write(id, value, () => ($(id).textContent = value));
const html = (id: string, value: string) =>
  write(`${id}.html`, value, () => ($(id).innerHTML = value));
const style = (id: string, property: string, value: string) =>
  write(`${id}.${property}`, value, () =>
    $(id).style.setProperty(property, value),
  );
const progress = [...document.querySelectorAll(".mission-progress i")];
/** Rewrite every piece of static copy; dynamic HUD text follows on the next tick. */
function applyLanguage() {
  document.documentElement.lang = language();
  for (const el of document.querySelectorAll<HTMLElement>("[data-t]"))
    el.textContent = t(el.dataset.t as StringKey);
  for (const el of document.querySelectorAll<HTMLElement>("[data-t-html]"))
    el.innerHTML = t(el.dataset.tHtml as StringKey);
  for (const el of document.querySelectorAll<HTMLElement>("[data-t-aria]"))
    el.setAttribute("aria-label", t(el.dataset.tAria as StringKey));
  for (const el of document.querySelectorAll<HTMLElement>("[data-t-title]"))
    el.title = t(el.dataset.tTitle as StringKey);
  $("leaderboard-button").setAttribute(
    "aria-label",
    board("topbar.leaderboardGlobalAria", "topbar.leaderboardLocalAria"),
  );
  $("race-best-label").textContent = board("race.bestGlobal", "race.bestLocal");
  $("touch-controls").setAttribute(
    "aria-label",
    t(touchWalking ? "touch.walking" : "touch.driving"),
  );
  syncCameraButton();
  renderLanguageControls();
  updateKeyHints();
  syncStartButton();
  refreshBest();
  shown.clear();
  // Open dialogs re-render in the new language; the kiosk keeps its own language step.
  if (lastDialog && lastDialog !== "kiosk") {
    lastDialog = "";
    syncDialog();
  }
}
applyLanguage();
function updateUI() {
  syncOperator();
  syncTouchControls();
  document.body.dataset.phase = state.phase;
  const race = state.race;
  $("race-clock").textContent = formatTime(race.elapsed);
  const dialogClock = document.getElementById("dialog-race-clock");
  if (dialogClock) dialogClock.textContent = formatTime(race.elapsed);
  $("race-status").textContent = t(
    race.practice
      ? "race.practice"
      : !race.started
        ? "race.moveToStart"
        : state.phase === "complete"
          ? "race.complete"
          : "race.onClock",
  );
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
      t("race.stageAria", {
        stage: stageShort(STAGES[i].key),
        status: t(
          done
            ? "race.stageDone"
            : active
              ? "race.stageCurrent"
              : "race.stageNext",
        ),
      }),
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
  text("objective-title", o.title);
  text("objective-detail", o.detail);
  text(
    "step-label",
    t("mission.step", {
      n: `0${Math.min(o.step + 1, 4)}`,
      name: t(
        (
          [
            "mission.arrival",
            "mission.checkin",
            "mission.access",
            "mission.delivery",
            "mission.done",
          ] as const
        )[o.step],
      ),
    }),
  );
  progress.forEach((el, i) => el.classList.toggle("active", i <= o.step));
  text(
    "speed",
    String(Math.round(Math.abs(state.truck.speed) * 3.6)).padStart(2, "0"),
  );
  text(
    "gear",
    isWalking
      ? "↟"
      : state.truck.speed < -0.05
        ? "R"
        : state.truck.speed > 0.05
          ? "D"
          : "N",
  );
  html(
    "assist-tag",
    state.assisted
      ? `<span class="live-dot"></span> ${t("tele.assist")}`
      : t("tele.classic"),
  );
  const beta =
    (angle(state.truck.heading - state.truck.trailerHeading) * 180) / Math.PI;
  text("articulation-value", `${Math.round(Math.abs(beta))}°`);
  style(
    "articulation-bar",
    "width",
    `${Math.min((Math.abs(beta) / 65) * 100, 100)}%`,
  );
  style(
    "articulation-bar",
    "background",
    Math.abs(beta) > 45 ? "#dc8444" : "#00a990",
  );
  const action = prompt(state);
  $("action-wrap").classList.toggle(
    "hidden",
    !action || !started || settingsOpen || operatorBusy(),
  );
  text("action-text", action);
  text("target-symbol", ["P", "↟", "↗", dockLabel(state.dock), "✓"][o.step]);
  text(
    "target-name",
    state.phase === "walk-truck" || state.phase === "dispatch"
      ? t("target.truck")
      : [
          t("target.bay"),
          t("target.checkin"),
          t("target.gate"),
          t("target.dock", { dock: dockLabel(state.dock) }),
          t("target.delivered"),
        ][o.step],
  );
  const slow = slowDown(state);
  $("target-label").classList.toggle("slow", slow);
  text(
    "target-distance",
    slow
      ? t("target.slow")
      : t("target.away", {
          m: Math.round(
            distance(isWalking ? state.driver : state.truck, o.target),
          ),
        }),
  );
  text("toast", state.message);
  $("toast").classList.toggle(
    "hidden",
    state.elapsed > state.messageUntil || !state.message || settingsOpen,
  );
  $("cli-resume").classList.toggle("hidden", !cliPaused);
  syncSms();
  const sms = smsReceived(state);
  text("note-label", t(sms ? "mission.smsFrom" : "mission.yourDelivery"));
  text(
    "delivery-reference",
    sms
      ? t("mission.pinDock", { pin: state.pin, dock: dockLabel(state.dock) })
      : `${state.booking} → ${t("mission.city")}`,
  );
  text("note-detail", t(sms ? "mission.gateCode" : "mission.reference"));
  const kv = keyVars();
  text(
    "stage-hint",
    state.phase === "arrive"
      ? p.ready
        ? t("hint.parked", { key: kv.interact })
        : p.inside
          ? t("hint.release")
          : t("hint.start", { key: kv.forward })
      : state.phase === "dock"
        ? t("hint.dock", { left: kv.left, right: kv.right })
        : state.phase === "dispatch"
          ? t("hint.dispatch")
          : isWalking
            ? t("hint.walk", {
                keys: [kv.forward, kv.left, kv.reverse, kv.right].join(""),
                key: kv.interact,
              })
            : t("hint.lane"),
  );
  $("dock-guide").classList.toggle(
    "hidden",
    state.phase !== "dock" || !started,
  );
  text("dock-offset", `${d.lateral.toFixed(1)} m`);
  text("dock-angle", `${d.angleDegrees.toFixed(0)}°`);
  text("dock-gap", d.gap > 0 ? `${d.gap.toFixed(1)} m` : t("dock.atBumper"));
  style(
    "dock-needle",
    "left",
    `${50 + Math.max(-47, Math.min(47, (rear(state.truck).x - dockX(state.dock)) * 10))}%`,
  );
  text(
    "dock-coach",
    t(
      d.angleDegrees > 90
        ? "dock.coachTurnAway"
        : d.ready
          ? "dock.coachHold"
          : d.lateral >= DOCK_TOLERANCE.lateral
            ? "dock.coachLineUp"
            : d.headingError >= DOCK_TOLERANCE.heading
              ? "dock.coachStraighten"
              : d.gap < 2
                ? "dock.coachBrake"
                : "dock.coachReverse",
    ),
  );
  text(
    "dock-tip",
    d.angleDegrees > 90
      ? t("dock.tipTurn")
      : t("dock.tipSlow", { key: kv.precision }),
  );
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
      settingsOpen ||
      operatorBusy(),
  );
  label.style.transform = `translate(${x}px,${y}px) translate(-50%,-115%)`;
}
// The simulation advances in fixed 1/60 s steps while frames arrive at the
// display rate. Drawing the raw state moves the rig on only some frames (every
// other frame at 120 Hz, and irregularly at 60 Hz as timestamps drift), which
// reads as stutter against the smoothly damped camera. Rendering blends the
// poses before and after the latest step by the accumulator's remainder.
let previous: { truck: Truck; driver: Point } | null = null;
function viewState(): State {
  if (!previous) return state;
  const alpha = Math.min(accumulator / DT, 1);
  return {
    ...state,
    truck: blendTruck(previous.truck, state.truck, alpha),
    driver: blendPoint(previous.driver, state.driver, alpha),
  };
}
function frame(now: number) {
  const wallDelta = Math.max(0, (now - last) / 1000);
  if (started && !cliPaused) tickRace(state.race, wallDelta);
  const dt = Math.min(wallDelta, 0.05);
  last = now;
  const pad = navigator.getGamepads?.().find((g) => g?.connected) ?? undefined;
  const input = currentInput(pad),
    dialogPaused =
      settingsOpen || leaderboardOpen || cliPaused || document.hidden,
    // The driver also waits while the camera is with the yard operator.
    paused = dialogPaused || operatorBusy();
  const pressed = !!pad?.buttons[0]?.pressed;
  if (pressed && !lastGamepadAction && started && !paused) {
    interact(state);
    syncDialog();
  }
  lastGamepadAction = pressed;
  // Holding X for a second jumps to the next place to act: kiosk, gate line, dock.
  // Playtest aid, deliberately unlisted. It also skips the operator's call-off.
  const holdingSkip =
    started &&
    !dialogPaused &&
    keys.has("x") &&
    !Object.values(bindings).includes("x");
  if (!holdingSkip) skipHeldSince = 0;
  else if (!skipHeldSince) skipHeldSince = now;
  else if (now - skipHeldSince >= 1000) {
    skipHeldSince = Infinity;
    if (skipAhead(state)) trackAction("skip_used", state);
  }
  if (started && !paused) {
    accumulator += dt;
    while (accumulator >= DT) {
      previous = { truck: { ...state.truck }, driver: { ...state.driver } };
      step(state, input, DT, false);
      accumulator -= DT;
    }
    // Recover, skip and restart move the rig further than any step can; snap
    // to the new pose instead of sliding there.
    if (
      previous &&
      (distance(previous.truck, state.truck) > 0.5 ||
        distance(previous.driver, state.driver) > 0.5 ||
        Math.abs(angle(previous.truck.heading - state.truck.heading)) > 0.35)
    )
      previous = null;
  } else {
    accumulator = 0;
    previous = null;
  }
  if (started) observe(state);
  scene.render(viewState(), input, dt, started);
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
  setControls("cli");
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
        "Drive or walk in the Peripass yard through the same controls as the visitor. Commands: reset, input, interact, register, dispatch, pin, recover, assist, drive-to, walk-to, demo. Input durations are seconds. Does not contact a real logistics system.",
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
              "dispatch",
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
          dock: { type: "number", minimum: 1, maximum: 5 },
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
    loadState = "ready";
    syncStartButton();
    import.meta.hot?.send("yard:ready", {});
  })
  .catch((error) => {
    loadState = "failed";
    syncStartButton();
    console.error(error);
  });
requestAnimationFrame(frame);
