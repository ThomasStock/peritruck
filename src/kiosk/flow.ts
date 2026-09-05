/** Kiosk registration flow: a small step machine mirroring the production kiosk.
 * Pure data, no DOM, so the browser view and tests share one contract.
 * Steps: language → check-in method → (visit type) → reference → phone → endscreen.
 */
import { type Lang, isLang } from "./i18n";
export type Step =
  "language" | "method" | "profile" | "reference" | "phone" | "endscreen";
export type Method = "reference" | "stepByStep";
export type Profile = "inbound" | "outbound" | "contractor";
export type Flow = {
  step: Step;
  language: Lang;
  method?: Method;
  profile?: Profile;
  /** Expected full reference, e.g. PP-2048; the prefix is derived from it. */
  booking: string;
  /** What the visitor typed after the fixed prefix. */
  reference: string;
  /** Last full reference that did not match, shown in the no-match alert. */
  attempted?: string;
  phoneCountry: string;
  phoneNumber: string;
};
export type Country = {
  iso2: string;
  name: string;
  dialCode: string;
  example: string;
};
export const COUNTRIES: Country[] = [
  { iso2: "BE", name: "Belgium", dialCode: "32", example: "0470 12 34 56" },
  { iso2: "NL", name: "Netherlands", dialCode: "31", example: "06 12345678" },
  { iso2: "FR", name: "France", dialCode: "33", example: "06 12 34 56 78" },
  { iso2: "DE", name: "Germany", dialCode: "49", example: "01512 3456789" },
  { iso2: "PL", name: "Poland", dialCode: "48", example: "512 345 678" },
  { iso2: "RO", name: "Romania", dialCode: "40", example: "0712 034 567" },
  {
    iso2: "GB",
    name: "United Kingdom",
    dialCode: "44",
    example: "07400 123456",
  },
];
export const country = (iso2: string): Country =>
  COUNTRIES.find((c) => c.iso2 === iso2) ?? COUNTRIES[0];
export const PROFILES: Profile[] = ["inbound", "outbound", "contractor"];
export function createFlow(booking: string): Flow {
  return {
    step: "language",
    language: "en",
    booking,
    reference: "",
    phoneCountry: "BE",
    phoneNumber: "",
  };
}
/** "PP-2048" → "PP-". A booking without a dash has no prefix. */
export const referencePrefix = (booking: string) =>
  booking.slice(0, booking.indexOf("-") + 1);
/** "PP-2048" → "2048". */
export const referenceBody = (booking: string) =>
  booking.slice(referencePrefix(booking).length);
/** Combine the fixed prefix with what was typed; a repeated prefix is forgiven. */
export function fullReference(booking: string, typed: string): string {
  const prefix = referencePrefix(booking);
  let body = typed.trim().toUpperCase();
  if (prefix && body.startsWith(prefix.toUpperCase()))
    body = body.slice(prefix.length);
  return prefix + body;
}
export function selectLanguage(f: Flow, lang: string) {
  if (f.step !== "language" || !isLang(lang)) return false;
  f.language = lang;
  f.step = "method";
  return true;
}
export function selectMethod(f: Flow, method: Method) {
  if (f.step !== "method") return false;
  f.method = method;
  f.step = method === "reference" ? "reference" : "profile";
  return true;
}
export function selectProfile(f: Flow, profile: Profile) {
  if (f.step !== "profile") return false;
  f.profile = profile;
  f.step = "reference";
  return true;
}
export function submitReference(f: Flow): boolean {
  if (f.step !== "reference" || !f.reference.trim()) return false;
  const full = fullReference(f.booking, f.reference);
  if (full !== f.booking.toUpperCase()) {
    f.attempted = full;
    return false;
  }
  f.attempted = undefined;
  f.reference = referenceBody(f.booking);
  f.step = "phone";
  return true;
}
export const phoneDigits = (number: string) => number.replace(/\D/g, "");
/** Demo validation: 6–15 digits, any formatting characters allowed. */
export function isValidPhone(number: string): boolean {
  if (/[^\d\s()+.-]/.test(number)) return false;
  const digits = phoneDigits(number);
  return digits.length >= 6 && digits.length <= 15;
}
export function formatPhone(iso2: string, number: string) {
  const digits = phoneDigits(number);
  // Leading block of 3 or 4, then pairs: 0470 12 34 56.
  const head = digits.length % 2 === 0 ? 4 : 3;
  const national =
    digits.length > head
      ? `${digits.slice(0, head)} ${digits.slice(head).replace(/(\d{2})(?=\d)/g, "$1 ")}`
      : digits;
  const trunk = digits.replace(/^0+/, "");
  const grouped = trunk.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
  return { national, international: `+${country(iso2).dialCode} ${grouped}` };
}
export function submitPhone(f: Flow): boolean {
  if (f.step !== "phone" || !isValidPhone(f.phoneNumber)) return false;
  f.step = "endscreen";
  return true;
}
export function previousStep(f: Flow): Step | null {
  switch (f.step) {
    case "method":
      return "language";
    case "profile":
      return "method";
    case "reference":
      return f.method === "stepByStep" ? "profile" : "method";
    case "phone":
      return "reference";
    default:
      return null;
  }
}
export function back(f: Flow): boolean {
  const target = previousStep(f);
  if (!target) return false;
  f.step = target;
  f.attempted = undefined;
  return true;
}
