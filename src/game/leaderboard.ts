import { STAGES, type Race } from "./race";

export type Result = {
  id: string;
  name: string;
  seconds: number;
  splits: number[];
  contacts: number;
  recoveries: number;
  assisted: boolean;
  date: string;
};
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const KEY = "peritruck-leaderboard-v1";
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;
export const cleanName = (name: string) =>
  name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
export type Leaderboard = {
  /** True when runs are shared across devices, false for this browser only. */
  shared: boolean;
  readonly available: boolean;
  list(): Result[];
  onChange(listener: () => void): () => void;
  save(result: Result): Promise<{ rank: number; persisted: boolean }>;
};
export function validResult(value: unknown): value is Result {
  if (!value || typeof value !== "object") return false;
  const r = value as Result;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    !!cleanName(r.name) &&
    finite(r.seconds) &&
    r.seconds > 0 &&
    finite(r.contacts) &&
    finite(r.recoveries) &&
    typeof r.assisted === "boolean" &&
    typeof r.date === "string" &&
    Array.isArray(r.splits) &&
    r.splits.length === STAGES.length &&
    r.splits.every(
      (n, i) => finite(n) && n >= (r.splits[i - 1] ?? 0) && n <= r.seconds,
    ) &&
    r.splits.at(-1) === r.seconds
  );
}
const ranked = (rows: Result[]) =>
  rows.sort((a, b) => a.seconds - b.seconds || a.date.localeCompare(b.date));

/** Browser-local fallback used when no Convex URL is configured. */
export function createLeaderboard(getStorage: () => Storage): Leaderboard {
  let memory: Result[] = [];
  let available = true;
  function list() {
    try {
      const parsed: unknown = JSON.parse(getStorage().getItem(KEY) ?? "[]");
      const rows = Array.isArray(parsed) ? parsed.filter(validResult) : [];
      memory = ranked([
        ...new Map([...rows, ...memory].map((r) => [r.id, r])).values(),
      ]).slice(0, 100);
    } catch {
      available = false;
    }
    return [...memory];
  }
  return {
    shared: false,
    list,
    get available() {
      return available;
    },
    onChange: () => () => {},
    async save(result: Result) {
      const row = { ...result, name: cleanName(result.name) };
      if (!validResult(row))
        throw new Error("Enter a name to save your completed run.");
      const rows = list().filter((r) => r.id !== row.id);
      const all = ranked([...rows, row]);
      const rank = all.findIndex((r) => r.id === row.id) + 1;
      memory = all.slice(0, 100);
      try {
        getStorage().setItem(KEY, JSON.stringify(memory));
        available = true;
      } catch {
        available = false;
      }
      return { rank, persisted: available };
    },
  };
}
export function resultFromRace(
  race: Race,
  stats: Pick<Result, "contacts" | "recoveries" | "assisted">,
): Result {
  return {
    id: crypto.randomUUID(),
    name: "",
    seconds: race.elapsed,
    splits: [...race.splits],
    contacts: stats.contacts,
    recoveries: stats.recoveries,
    assisted: stats.assisted,
    date: new Date().toISOString(),
  };
}
/** Seconds spent in one timed section; splits are cumulative. Undefined once a run stops short. */
export function sectionSeconds(result: Pick<Result, "splits">, stage: number) {
  const end = result.splits[stage];
  return end === undefined ? undefined : end - (result.splits[stage - 1] ?? 0);
}
export type SectionEntry = { result: Result; seconds: number; rank: number };
/** Runs ordered by one section's time, fastest first; `own` joins the board until it is saved. */
export function sectionBoard(
  rows: Result[],
  stage: number,
  own?: Result,
): SectionEntry[] {
  const all = own && !rows.some((r) => r.id === own.id) ? [...rows, own] : rows;
  return all
    .flatMap((result) => {
      const seconds = sectionSeconds(result, stage);
      return seconds === undefined ? [] : [{ result, seconds }];
    })
    .sort(
      (a, b) =>
        a.seconds - b.seconds || a.result.date.localeCompare(b.result.date),
    )
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}
