import * as amplitude from "@amplitude/analytics-browser";
import type { Phase, State } from "./game/simulation";

// Public browser key; safe to ship. Override per environment with VITE_AMPLITUDE_API_KEY.
const API_KEY =
  import.meta.env.VITE_AMPLITUDE_API_KEY ?? "dce7365006d7db08fcfb56f35c0d7ea4";

const PHASES: Phase[] = [
  "arrive",
  "walk-kiosk",
  "kiosk",
  "walk-truck",
  "gate",
  "pin",
  "dock",
  "complete",
];

export type Controls = "keyboard" | "touch" | "gamepad" | "cli";

// Skip local dev, headless drivers and CLI-driven sessions so funnels stay human-only.
const enabled =
  import.meta.env.PROD &&
  typeof navigator !== "undefined" &&
  !navigator.webdriver;

let tracked: State | undefined,
  lastPhase: Phase | undefined,
  phaseSince = 0,
  controls: Controls = "keyboard",
  cli = false;

export function initAnalytics() {
  if (!enabled) return;
  amplitude.init(API_KEY, {
    autocapture: {
      sessions: true,
      pageViews: true,
      formInteractions: false,
      fileDownloads: false,
      elementInteractions: false,
    },
    defaultTracking: false,
  });
}

export function track(event: string, props: Record<string, unknown> = {}) {
  if (!enabled || cli) return;
  amplitude.track(event, props);
}

export function setControls(c: Controls) {
  if (c === "cli") cli = true;
  if (c === controls) return;
  controls = c;
  if (enabled) {
    const id = new amplitude.Identify().set("controls", c);
    amplitude.identify(id);
  }
}

const round = (n: number) => Math.round(n * 10) / 10;

function progress(s: State) {
  return {
    phase: s.phase,
    step: PHASES.indexOf(s.phase),
    elapsed_s: round(s.elapsed),
    distance_m: round(s.distance),
    contacts: s.contacts,
    recoveries: s.recoveries,
    assisted: s.assisted,
    controls,
  };
}

/** Call once per frame. Detects restarts (new State object) and phase transitions. */
export function observe(s: State) {
  if (s !== tracked) {
    if (tracked && tracked.phase !== "complete")
      track("demo_restarted", progress(tracked));
    tracked = s;
    lastPhase = s.phase;
    phaseSince = s.elapsed;
    track("demo_started", { assisted: s.assisted, controls });
    return;
  }
  if (s.phase === lastPhase) return;
  track("phase_reached", {
    ...progress(s),
    from: lastPhase,
    phase_s: round(s.elapsed - phaseSince),
  });
  if (s.phase === "complete") track("demo_completed", progress(s));
  lastPhase = s.phase;
  phaseSince = s.elapsed;
}

export function trackAction(
  event: "pin_rejected" | "skip_used" | "recover_used",
  s: State,
) {
  track(event, progress(s));
}
