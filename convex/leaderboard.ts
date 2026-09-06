import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { cleanName, validResult, type Result } from "../src/game/leaderboard";

const MAX_SECONDS = 60 * 60 * 24;
const result = {
  id: v.string(),
  name: v.string(),
  seconds: v.number(),
  splits: v.array(v.number()),
  contacts: v.number(),
  recoveries: v.number(),
  assisted: v.boolean(),
  date: v.string(),
};

export const top = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }): Promise<Result[]> => {
    const rows = await ctx.db
      .query("results")
      .withIndex("by_seconds")
      .order("asc")
      .take(Math.min(Math.max(1, Math.floor(limit)), 100));
    return rows.map(({ _id, _creationTime, runId, ...rest }) => ({
      id: runId,
      ...rest,
    }));
  },
});

export const save = mutation({
  args: result,
  handler: async (ctx, args) => {
    const row: Result = { ...args, name: cleanName(args.name) };
    if (!validResult(row) || row.seconds > MAX_SECONDS)
      throw new Error("Enter a name to save your completed run.");
    if (Number.isNaN(Date.parse(row.date))) throw new Error("Invalid date.");
    const { id, ...rest } = row;
    const existing = await ctx.db
      .query("results")
      .withIndex("by_runId", (q) => q.eq("runId", id))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { name: row.name });
    else await ctx.db.insert("results", { runId: id, ...rest });
    const faster = await ctx.db
      .query("results")
      .withIndex("by_seconds", (q) => q.lt("seconds", row.seconds))
      .collect();
    const tied = await ctx.db
      .query("results")
      .withIndex("by_seconds", (q) =>
        q.eq("seconds", row.seconds).lt("date", row.date),
      )
      .collect();
    return { rank: faster.length + tied.length + 1 };
  },
});
