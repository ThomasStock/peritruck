import test from "node:test";
import assert from "node:assert/strict";
import {
  COUNTRIES,
  back,
  createFlow,
  formatPhone,
  fullReference,
  isValidPhone,
  previousStep,
  referenceBody,
  referencePrefix,
  selectLanguage,
  selectMethod,
  selectProfile,
  submitPhone,
  submitReference,
} from "../src/kiosk/flow";
import { LANGUAGES, STRINGS, t } from "../src/kiosk/i18n";

test("reference method: language, method, reference with prefix, phone, endscreen", () => {
  const f = createFlow("PP-2048");
  assert.equal(f.step, "language");
  assert.ok(selectLanguage(f, "nl"));
  assert.equal(f.language, "nl");
  assert.equal(f.step, "method");
  assert.ok(selectMethod(f, "reference"));
  assert.equal(f.step, "reference");
  f.reference = " 2048 ";
  assert.ok(submitReference(f));
  assert.equal(f.step, "phone");
  assert.equal(f.attempted, undefined);
  f.phoneNumber = "0470 12 34 56";
  assert.ok(submitPhone(f));
  assert.equal(f.step, "endscreen");
  assert.equal(previousStep(f), null);
  assert.equal(back(f), false);
});

test("step-by-step method asks the visit type first, then the same reference step", () => {
  const f = createFlow("PP-2048");
  selectLanguage(f, "en");
  assert.ok(selectMethod(f, "stepByStep"));
  assert.equal(f.step, "profile");
  assert.ok(selectProfile(f, "contractor"));
  assert.equal(f.step, "reference");
  assert.equal(previousStep(f), "profile");
  assert.ok(back(f));
  assert.equal(f.step, "profile");
  assert.ok(back(f));
  assert.equal(f.step, "method");
  assert.ok(back(f));
  assert.equal(f.step, "language");
});

test("prefix is fixed on screen; a wrong reference stays on the step with the attempted value", () => {
  assert.equal(referencePrefix("PP-2048"), "PP-");
  assert.equal(referenceBody("PP-2048"), "2048");
  assert.equal(referencePrefix("2048"), "");
  assert.equal(fullReference("PP-2048", "pp-2048"), "PP-2048");
  assert.equal(fullReference("PP-2048", "1234"), "PP-1234");
  const f = createFlow("PP-2048");
  selectLanguage(f, "de");
  selectMethod(f, "reference");
  f.reference = "1234";
  assert.equal(submitReference(f), false);
  assert.equal(f.step, "reference");
  assert.equal(f.attempted, "PP-1234");
  f.reference = "";
  assert.equal(submitReference(f), false);
  f.reference = "2048";
  assert.ok(submitReference(f));
  assert.equal(f.reference, "2048");
});

test("steps cannot be skipped or answered out of order", () => {
  const f = createFlow("PP-2048");
  assert.equal(selectMethod(f, "reference"), false);
  assert.equal(submitReference(f), false);
  assert.equal(submitPhone(f), false);
  assert.equal(selectLanguage(f, "xx"), false);
  assert.equal(f.step, "language");
  selectLanguage(f, "pl");
  assert.equal(selectProfile(f, "inbound"), false);
  assert.equal(f.step, "method");
});

test("demo phone validation accepts any plausible number and formats it", () => {
  assert.ok(isValidPhone("0470 12 34 56"));
  assert.ok(isValidPhone("+32 470 12 34 56"));
  assert.equal(isValidPhone("12"), false);
  assert.equal(isValidPhone("call me"), false);
  assert.equal(isValidPhone("1234567890123456"), false);
  const formatted = formatPhone("BE", "0470123456");
  assert.equal(formatted.international, "+32 470 123 456");
  assert.equal(formatted.national, "0470 12 34 56");
  assert.equal(formatPhone("PL", "512345678").national, "512 34 56 78");
  assert.ok(COUNTRIES.some((c) => c.iso2 === "BE"));
  const f = createFlow("PP-2048");
  selectLanguage(f, "ro");
  selectMethod(f, "reference");
  f.reference = "2048";
  submitReference(f);
  f.phoneNumber = "12";
  assert.equal(submitPhone(f), false);
  assert.equal(f.step, "phone");
});

test("every kiosk string exists in every offered language and interpolates", () => {
  for (const key of Object.keys(STRINGS) as (keyof typeof STRINGS)[])
    for (const { code } of LANGUAGES) {
      const value = STRINGS[key][code];
      assert.ok(value && value.trim(), `${key} missing for ${code}`);
    }
  assert.equal(
    t("nl", "referenceNoMatch", { reference: "PP-1234" }),
    "Geen overeenkomst voor PP-1234",
  );
  assert.equal(
    t("en", "referenceExtraBody", { prefix: "PP-" }).includes("PP-"),
    true,
  );
});
