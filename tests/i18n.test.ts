import test from "node:test";
import assert from "node:assert/strict";
import {
  LANGUAGES,
  STRINGS,
  obstacleName,
  resolveLanguage,
  setLanguage,
  t,
  type Lang,
  type StringKey,
} from "../src/i18n";
import {
  createState,
  objective,
  obstacles,
  prompt,
  interact,
} from "../src/game/simulation";
import { smsLines } from "../src/sms";
import { STAGES, stageName } from "../src/game/race";

const placeholders = (s: string) =>
  [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

test("every string is translated into all four languages with the same placeholders", () => {
  const codes = LANGUAGES.map((l) => l.code);
  for (const [key, copy] of Object.entries(STRINGS)) {
    const en = copy.en;
    for (const code of codes) {
      const text = (copy as Record<Lang, string>)[code];
      assert.ok(text && text.trim(), `${key} lacks ${code}`);
      assert.deepEqual(
        placeholders(text),
        placeholders(en),
        `${key} (${code}) placeholders differ from English`,
      );
    }
  }
});

test("browser language resolves to an offered language, else English", () => {
  assert.equal(resolveLanguage(["nl-BE", "en"]), "nl");
  assert.equal(resolveLanguage(["pt-BR", "de-AT"]), "de");
  assert.equal(resolveLanguage(["pt-BR"]), "en");
  // The kiosk offers Polish and Romanian; the game UI does not.
  assert.equal(resolveLanguage(["pl-PL"]), "en");
  assert.equal(resolveLanguage([]), "en");
});

test("placeholders fill in and unknown ones vanish", () => {
  assert.equal(t("target.dock", { dock: "02" }), "DOCK 02");
  assert.equal(t("target.away", { m: 12 }), "12 m away");
  assert.equal(
    t("mission.step", { n: "01", name: "ARRIVAL" }),
    "01 / 04 · ARRIVAL",
  );
});

test("obstacle identifiers stay English in the simulation and translate in toasts", () => {
  const names = new Set(
    obstacles(createState())
      .map((o) => o.name)
      .filter(Boolean),
  );
  for (const name of names)
    assert.ok(`obstacle.${name}` in STRINGS, `no copy for obstacle "${name}"`);
  setLanguage("de");
  try {
    assert.equal(obstacleName("Parked truck"), "Geparkter Truck");
    assert.equal(obstacleName("unknown thing"), "unknown thing");
  } finally {
    setLanguage("en");
  }
});

test("the simulation, SMS and stages speak the chosen language", () => {
  const s = createState();
  setLanguage("fr");
  try {
    assert.equal(objective(s).title, "Parking chauffeurs");
    assert.equal(prompt(s), "");
    assert.equal(stageName(STAGES[3].key), "Se garer au quai");
    assert.match(smsLines("PP-1", "1234", 2)[2], /quai 02\./);
    interact(s); // not parked yet: the toast is French too
    assert.equal(s.message, "Arrêtez-vous d’abord dans la zone indiquée.");
  } finally {
    setLanguage("en");
  }
  assert.equal(objective(s).title, "Driver parking");
  const key: StringKey = "intro.start";
  assert.equal(t(key, {}, "nl"), "Rijden maar");
});

test("the kiosk keeps its own six-language page", async () => {
  const kiosk = await import("../src/kiosk/i18n");
  assert.equal(kiosk.LANGUAGES.length, 6);
  assert.equal(LANGUAGES.length, 4);
  // Every game language is one the kiosk also speaks.
  for (const l of LANGUAGES)
    assert.ok(kiosk.isLang(l.code), `kiosk lacks ${l.code}`);
});
