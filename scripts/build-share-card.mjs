/** The link preview card (og:image), rendered from the real game.
 *
 * The background is the yard as the browser draws it on the start screen, not
 * an exported illustration: the script opens the running dev server, asks the
 * game for a canvas screenshot through the same /__yard/control bridge the CLI
 * uses, lays the start screen's own copy over it, and writes the JPEG that
 * index.html points og:image and twitter:image at.
 *
 * Run against `npm run dev`, then: node scripts/build-share-card.mjs [url]
 * PLAYWRIGHT_MODULE points at a Playwright install outside this project.
 *
 * Output: public/og/share.jpg at 2400x1260 (a 1200x630 card at 2x).
 */
import { pathToFileURL } from "node:url";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const url = (process.argv[2] ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public/og/share.jpg");
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : "playwright"
);

const base64 = async (file) => (await readFile(file)).toString("base64");
const font = async (weight) =>
  `data:font/woff2;base64,${await base64(
    path.join(
      root,
      `node_modules/@fontsource/montserrat/files/montserrat-latin-${weight}-normal.woff2`,
    ),
  )}`;
const logo = `data:image/svg+xml;base64,${await base64(
  path.join(root, "public/brand/peripass.svg"),
)}`;

// The yard, drawn by the game itself. The page has to finish loading its
// models before the bridge will answer.
const yard = await chromium.launch({ headless: true });
const game = await yard.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
await game.goto(`${url}/`, { waitUntil: "load" });
await game.waitForFunction(
  () => {
    const start = document.getElementById("start");
    return start instanceof HTMLButtonElement && !start.disabled;
  },
  { timeout: 120000 },
);
const response = await fetch(`${url}/__yard/control`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Yard-CLI": "1" },
  body: JSON.stringify({ op: "screenshot" }),
  signal: AbortSignal.timeout(45000),
});
const shot = await response.json();
if (!shot.ok) throw new Error(shot.error ?? "The game did not answer.");
await yard.close();

const stages = ["Park", "Kiosk", "Gate", "Dock"]
  .map((stage, i) => `<span><b>0${i + 1}</b>${stage}</span>`)
  .join("");
const card = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:M;src:url(${await font(400)}) format('woff2');font-weight:400}
@font-face{font-family:M;src:url(${await font(600)}) format('woff2');font-weight:600}
@font-face{font-family:M;src:url(${await font(700)}) format('woff2');font-weight:700}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:M,system-ui,sans-serif;background:#163e38;color:#f5f9ec;-webkit-font-smoothing:antialiased}
.yard{position:absolute;inset:0;background-image:url(${shot.image});background-repeat:no-repeat;background-size:126%;background-position:66% 44%}
/* The dark side of the card, so the copy keeps its contrast over the yard. */
.scrim{position:absolute;inset:0;background:linear-gradient(97deg,#10352ff7 0%,#10352ff0 30%,#10352f8c 48%,#10352f1f 64%,#10352f00 78%)}
.copy{position:absolute;left:68px;top:64px;bottom:64px;width:610px;display:flex;flex-direction:column}
.logo{height:34px;align-self:flex-start;margin-bottom:44px;filter:brightness(0) invert(1);opacity:.95}
.kicker{font-size:17px;font-weight:700;letter-spacing:3.4px;color:#c6f389;margin-bottom:20px}
h1{font-size:76px;font-weight:700;line-height:.98;letter-spacing:-2.8px}
p{margin-top:22px;font-size:25px;font-weight:400;line-height:1.45;color:#cfe0d5}
.stages{margin-top:auto;display:flex;gap:34px}
.stages span{font-size:16px;color:#d0e0d7}
.stages b{display:block;font-size:24px;font-weight:700;color:#c6f389;margin-bottom:6px}
.chip{position:absolute;right:56px;bottom:56px;display:flex;align-items:center;gap:16px;padding:22px 30px;border:1px solid #ffffff3d;border-radius:20px;background:#123f36f0;font-size:28px;font-weight:700;letter-spacing:-.6px}
.chip i{font-style:normal;color:#c6f389}
</style>
<div class="yard"></div><div class="scrim"></div>
<div class="copy">
  <img class="logo" src="${logo}" alt="Peripass">
  <div class="kicker">YARD TIME TRIAL</div>
  <h1>Fastest truck<br>in the yard.</h1>
  <p>Park. Check in. Open the gate.<br>Reverse into the dock.</p>
  <div class="stages">${stages}</div>
</div>
<div class="chip">Think you can dock faster? <i>&rarr;</i></div>`;

// A fresh browser: the WebGL context the game leaves behind starves the
// screenshot of the card.
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
// Chromium refuses to screenshot a page this heavy when it is set inline, so
// the card goes through a file of its own.
const scratch = path.join(os.tmpdir(), `peritruck-share-${process.pid}.html`);
await writeFile(scratch, card);
await page.goto(pathToFileURL(scratch).href, { waitUntil: "load" });
await page.evaluate(async () => {
  await document.fonts.ready;
});
await mkdir(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, type: "jpeg", quality: 82 });
await browser.close();
await rm(scratch, { force: true });
console.log(`wrote ${path.relative(root, out)}`);
