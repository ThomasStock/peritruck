#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createState, type State } from "../src/game/simulation";
import { execute, type Command } from "../src/game/commands";
const args = process.argv.slice(2),
  op = args.shift() ?? "help";
const flags: Record<string, string | boolean> = {};
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith("--"))
    throw new Error(`Expected --option, got ${args[i]}`);
  const k = args[i].slice(2);
  flags[k] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
}
if (op === "help") {
  console.log(`Yard Shift CLI · same simulation as the browser

npm run truck -- status
npm run truck -- input --throttle 1 --steer 0 --seconds 3
npm run truck -- input --brake --seconds 1
npm run truck -- drive-to --x -24 --z 39
npm run truck -- interact
npm run truck -- walk-to --x -28 --z 29
npm run truck -- register --booking PP-2048
npm run truck -- pin --pin 2048
npm run truck -- demo
npm run truck -- recover
npm run truck -- reset

--live             Control the browser at the running Vite server
--url URL          Development server URL (default http://127.0.0.1:5173)
--session NAME     Independent persisted headless session (default default)
--reverse          drive-to tracks the trailer rear; ordinary forward tracks hitch
--stop false       Pass through a drive-to waypoint

Live only: pause, resume, screenshot --out artifacts/yard.png
CLI commands advance deterministic time; live play pauses until resume.
Headless state: .yard-sessions/NAME.json. JSON output; failures exit 1.`);
  process.exit(0);
}
const c: Command = { op };
const numeric = [
  "throttle",
  "steer",
  "seconds",
  "x",
  "z",
  "walkX",
  "walkZ",
  "tolerance",
];
const boolean = ["brake", "precision", "reverse", "enabled", "stop"];
for (const [k, v] of Object.entries(flags)) {
  if (numeric.includes(k)) c[k] = Number(v);
  else if (boolean.includes(k)) c[k] = v === true || v === "true";
  else if (["pin", "booking"].includes(k)) c[k] = String(v);
}
try {
  if (flags.live) {
    const url =
      typeof flags.url === "string" ? flags.url : "http://127.0.0.1:5173";
    const response = await fetch(`${url}/__yard/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Yard-CLI": "1" },
      body: JSON.stringify(c),
      signal: AbortSignal.timeout(45000),
    });
    const result = (await response.json()) as {
      ok: boolean;
      error?: string;
      image?: string;
      [key: string]: unknown;
    };
    if (!response.ok || !result.ok)
      throw new Error(result.error ?? "Live command failed.");
    if (result.image) {
      const file = resolve(
        typeof flags.out === "string" ? flags.out : "artifacts/yard.png",
      );
      await mkdir(resolve(file, ".."), { recursive: true });
      await writeFile(file, Buffer.from(result.image.split(",")[1], "base64"));
      delete result.image;
      result.file = file;
    }
    console.log(JSON.stringify(result, null, 2));
  } else {
    const name = typeof flags.session === "string" ? flags.session : "default";
    if (!/^[a-zA-Z0-9_-]+$/.test(name))
      throw new Error("Session name must be alphanumeric.");
    await mkdir(".yard-sessions", { recursive: true });
    const file = `.yard-sessions/${name}.json`;
    let s: State;
    try {
      s = JSON.parse(await readFile(file, "utf8"));
      if (s.version !== 2)
        throw new Error("Unsupported saved session version.");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") s = createState();
      else throw e;
    }
    const result = execute(s, c);
    await writeFile(file, JSON.stringify(s));
    console.log(JSON.stringify({ ok: true, state: result }, null, 2));
  }
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: (e as Error).message }));
  process.exitCode = 1;
}
