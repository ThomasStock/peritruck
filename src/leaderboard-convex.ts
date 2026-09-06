import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Leaderboard, Result } from "./game/leaderboard";

/** Shared leaderboard backed by Convex; `list()` serves the latest subscription snapshot. */
export function createConvexLeaderboard(url: string): Leaderboard {
  const client = new ConvexClient(url);
  let rows: Result[] = [];
  let available = false;
  const listeners = new Set<() => void>();
  client.onUpdate(
    api.leaderboard.top,
    { limit: 100 },
    (next) => {
      rows = next;
      available = true;
      for (const listener of listeners) listener();
    },
    () => {
      available = false;
      for (const listener of listeners) listener();
    },
  );
  return {
    shared: true,
    get available() {
      return available;
    },
    list: () => [...rows],
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async save(result) {
      const { rank } = await client.mutation(api.leaderboard.save, result);
      return { rank, persisted: true };
    },
  };
}
