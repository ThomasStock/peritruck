import { Sentry } from "./sentry";

export interface Feedback {
  message: string;
  email?: string;
  /** Where the form was opened from, kept as a Sentry tag for triage. */
  source: "topbar" | "results";
  /** Game phase at submit time, kept as a Sentry tag. */
  phase: string;
}

/**
 * Sends user feedback to Sentry User Feedback. Resolves once the envelope is
 * accepted; rejects on network/client errors so the form can show a retry.
 * Without an initialised Sentry client (local dev) the feedback is logged only.
 */
export async function sendFeedback(feedback: Feedback): Promise<void> {
  const message = feedback.message.trim();
  if (!message) throw new Error("Write a few words first.");
  const email = feedback.email?.trim() || undefined;
  if (!Sentry.isInitialized()) {
    console.info("[feedback] Sentry disabled; not sent", {
      ...feedback,
      message,
      email,
    });
    return;
  }
  await Sentry.sendFeedback(
    {
      message,
      email,
      source: "peritruck-form",
      tags: { feedback_source: feedback.source, phase: feedback.phase },
    },
    { includeReplay: true },
  );
}
