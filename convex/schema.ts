import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  results: defineTable({
    runId: v.string(),
    name: v.string(),
    seconds: v.number(),
    splits: v.array(v.number()),
    contacts: v.number(),
    recoveries: v.number(),
    assisted: v.boolean(),
    date: v.string(),
  })
    .index("by_seconds", ["seconds", "date"])
    .index("by_runId", ["runId"]),
});
