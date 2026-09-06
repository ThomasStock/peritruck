export const STAGES = [
  { name: "Park the truck", short: "Parking", icon: "P" },
  { name: "Complete check-in", short: "Kiosk", icon: "↟" },
  { name: "Open the gate", short: "Gate", icon: "↗" },
  { name: "Park at dock 03", short: "Dock", icon: "03" },
] as const;

/** Seconds, independent of physics time: browser uses real time, CLI fixed steps. */
export type Race = {
  started: boolean;
  elapsed: number;
  splits: number[];
  finished: boolean;
  practice: boolean;
};
export const createRace = (): Race => ({
  started: false,
  elapsed: 0,
  splits: [],
  finished: false,
  practice: false,
});
export function tickRace(race: Race, seconds: number) {
  if (
    race.started &&
    !race.finished &&
    race.splits.length < STAGES.length &&
    Number.isFinite(seconds)
  )
    race.elapsed += Math.max(0, seconds);
}
export function finishStage(race: Race, index: number) {
  if (race.started && race.splits.length === index)
    race.splits.push(race.elapsed);
}
export function formatTime(seconds: number) {
  const hundredths = Math.floor(Math.max(0, seconds) * 100 + 1e-7);
  return `${String(Math.floor(hundredths / 6000)).padStart(2, "0")}:${String(Math.floor(hundredths / 100) % 60).padStart(2, "0")}.${String(hundredths % 100).padStart(2, "0")}`;
}
