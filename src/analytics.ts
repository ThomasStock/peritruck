import * as amplitude from "@amplitude/analytics-browser";
import type { Phase, State } from "./game/simulation";
import { STAGES } from "./game/race";

// Public browser key; safe to ship. Override per environment with VITE_AMPLITUDE_API_KEY.
const API_KEY =
  import.meta.env.VITE_AMPLITUDE_API_KEY ?? "dce7365006d7db08fcfb56f35c0d7ea4";

const PHASES: Phase[] = [
  "arrive",
  "walk-kiosk",
  "kiosk",
  "walk-truck",
  "dispatch",
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
  raceStarted = false,
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
  if (enabled && !cli) {
    const id = new amplitude.Identify().set("controls", c);
    amplitude.identify(id);
  }
}

const round = (n: number) => Math.round(n * 10) / 10;

function progress(s: State) {
  // Older persisted CLI sessions predate race tracking.
  const race = s.race ?? {
    started: false,
    elapsed: 0,
    splits: [],
    practice: false,
  };
  return {
    phase: s.phase,
    step: PHASES.indexOf(s.phase),
    elapsed_s: round(s.elapsed),
    // Wall-clock race time (keeps running while dialogs are open) vs simulated elapsed_s.
    race_s: round(race.elapsed),
    race_started: race.started,
    stage: race.splits.length,
    practice: race.practice,
    distance_m: round(s.distance),
    contacts: s.contacts,
    recoveries: s.recoveries,
    assisted: s.assisted,
    controls,
  };
}

/** Per-stage durations, so funnels can compare Parking vs Kiosk vs Gate vs Dock. */
function splits(s: State) {
  const out: Record<string, number> = {};
  s.race?.splits.forEach((at, i) => {
    out[`split_${STAGES[i].short.toLowerCase()}_s`] = round(
      at - (s.race.splits[i - 1] ?? 0),
    );
  });
  return out;
}

/** Call once per frame. Detects restarts (new State object) and phase transitions. */
export function observe(s: State) {
  if (s !== tracked) {
    if (tracked && tracked.phase !== "complete")
      track("demo_restarted", progress(tracked));
    track("demo_started", {
      assisted: s.assisted,
      controls,
      replay: !!tracked,
      after_complete: tracked?.phase === "complete",
    });
    tracked = s;
    lastPhase = s.phase;
    phaseSince = s.elapsed;
    raceStarted = !!s.race?.started;
    return;
  }
  // The clock only starts on first movement; that is the real engagement point.
  if (!raceStarted && s.race?.started) {
    raceStarted = true;
    track("race_started", progress(s));
  }
  if (s.phase === lastPhase) return;
  track("phase_reached", {
    ...progress(s),
    from: lastPhase,
    phase_s: round(s.elapsed - phaseSince),
  });
  if (s.phase === "complete") {
    const eligible =
      !!s.race && !s.race.practice && s.race.splits.length === STAGES.length;
    track("demo_completed", { ...progress(s), ...splits(s), eligible });
    if (enabled && !cli && eligible) {
      const id = new amplitude.Identify()
        .add("runs_completed", 1)
        .set("last_run_s", round(s.race.elapsed));
      amplitude.identify(id);
    }
  }
  lastPhase = s.phase;
  phaseSince = s.elapsed;
}

export function trackAction(
  event:
    | "pin_rejected"
    | "skip_used"
    | "recover_used"
    | "leaderboard_opened"
    | "section_board_opened"
    | "score_saved"
    | "visitor_dispatched",
  s: State,
  props: Record<string, unknown> = {},
) {
  track(event, { ...progress(s), ...props });
}

/** Saved run stats live on the user so cohorts can be cut by skill, not per event. */
export function identifyBest(seconds: number) {
  if (!enabled || cli) return;
  const id = new amplitude.Identify().set("local_best_s", round(seconds));
  amplitude.identify(id);
}
