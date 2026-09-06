import * as Sentry from "@sentry/browser";

const DSN =
  import.meta.env.VITE_SENTRY_DSN ??
  "https://02c33b455fc91ea87c7a3b0607aca932@o4512038095945728.ingest.de.sentry.io/4512038110036048";

// Enabled for production builds (Vercel production + preview deploys).
// Force on locally with VITE_SENTRY_ENABLED=1 (e.g. `npm run preview`).
const ENABLED =
  import.meta.env.PROD || import.meta.env.VITE_SENTRY_ENABLED === "1";

if (ENABLED) {
  Sentry.init({
    dsn: DSN,
    environment: __APP_ENV__,
    release: __APP_RELEASE__ ?? undefined,
    sendDefaultPii: false,
    integrations: [
      // Performance: pageload/navigation transactions, web vitals, resource spans.
      Sentry.browserTracingIntegration(),
      // JS self-profiling; sampled relative to traced transactions.
      // Requires the `Document-Policy: js-profiling` response header (see vercel.json / vite.config.ts).
      Sentry.browserProfilingIntegration(),
      // Session replay: DOM recording around errors for troubleshooting.
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
      // Console/network breadcrumbs are on by default; this adds captured console.error as events.
      Sentry.captureConsoleIntegration({ levels: ["error"] }),
    ],
    tracesSampleRate: __APP_ENV__ === "production" ? 0.25 : 1.0,
    profilesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    ignoreErrors: ["ResizeObserver loop", "AbortError"],
  });
}

export { Sentry };
