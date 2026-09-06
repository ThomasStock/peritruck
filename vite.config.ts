import { defineConfig, type Plugin, type WebSocketClient } from "vite";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Browser JS self-profiling requires this document policy on the HTML response.
const PROFILING_HEADERS = { "Document-Policy": "js-profiling" };

function gitSha(): string | undefined {
  try {
    return execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

const RELEASE = process.env.VERCEL_GIT_COMMIT_SHA ?? gitSha();
const APP_ENV = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

function yardBridge(): Plugin {
  return {
    name: "yard-local-control",
    apply: "serve",
    configureServer(server) {
      let activeClient: WebSocketClient | undefined;
      server.ws.on("yard:ready", (_data, client) => {
        activeClient = client;
      });
      const pending = new Map<
        string,
        {
          finish: (data: unknown) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >();
      server.ws.on("yard:result", (data) => {
        const job = pending.get(data.id);
        if (job) {
          clearTimeout(job.timer);
          pending.delete(data.id);
          job.finish(data.result);
        }
      });
      server.middlewares.use("/__yard/control", (req, res) => {
        const address = req.socket.remoteAddress;
        if (
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address ?? "") ||
          req.headers["x-yard-cli"] !== "1" ||
          req.headers.origin
        ) {
          res.writeHead(403);
          res.end(
            JSON.stringify({ ok: false, error: "Local CLI requests only." }),
          );
          return;
        }
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
          if (body.length > 16384) req.destroy();
        });
        req.on("end", () => {
          try {
            const command = JSON.parse(body),
              id = randomUUID();
            if (!activeClient) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  ok: false,
                  error: "Open the local game preview before using --live.",
                }),
              );
              return;
            }
            const timer = setTimeout(() => {
              pending.delete(id);
              res.writeHead(504, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  ok: false,
                  error:
                    "No game browser responded. Open the local game preview first.",
                }),
              );
            }, 40000);
            pending.set(id, {
              timer,
              finish(data) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(data));
              },
            });
            activeClient.send("yard:command", { id, command });
          } catch {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: "Invalid JSON." }));
          }
        });
      });
      server.httpServer?.on("close", () => {
        for (const p of pending.values()) clearTimeout(p.timer);
        pending.clear();
      });
    },
  };
}
export default defineConfig({
  plugins: [
    yardBridge(),
    sentryVitePlugin({
      org: "stackhouse-2e",
      project: "peritruck",
      // Set SENTRY_AUTH_TOKEN (org auth token) in the build environment to
      // upload source maps. Without it the plugin is disabled and the build
      // still succeeds.
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      release: { name: RELEASE, inject: true, setCommits: { auto: true } },
      sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
    }),
  ],
  define: {
    __APP_ENV__: JSON.stringify(APP_ENV),
    __APP_RELEASE__: JSON.stringify(RELEASE ?? null),
  },
  // Tooling may assign a port through PORT; otherwise Vite picks its default.
  server: {
    ...(process.env.PORT
      ? { port: Number(process.env.PORT), strictPort: true }
      : {}),
    headers: PROFILING_HEADERS,
  },
  preview: { headers: PROFILING_HEADERS },
  build: {
    sourcemap: true,
    rollupOptions: { output: { manualChunks: { three: ["three"] } } },
  },
});
