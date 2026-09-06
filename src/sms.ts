/** The driver's phone. The check-in SMS is shown twice: as a lock-screen style
 * banner when it lands, and as a Messages thread on a rendered handset at the gate.
 * Pure HTML builders; main.ts decides when each is visible.
 */
import { dockLabel } from "./game/simulation";
import { t } from "./i18n";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const SMS_SENDER = "Peripass";
/** The message body, one entry per paragraph. The PIN sits alone on the middle line. */
export function smsLines(booking: string, pin: string, dock = 3): string[] {
  return [
    t("sms.line1", { booking }),
    t("sms.pin", { pin }),
    t("sms.line3", { dock: dockLabel(dock) }),
  ];
}
/** 24-hour wall clock, as shown on the handset. */
export const clock = (date = new Date()) =>
  date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const svg = (viewBox: string, body: string, cls = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" aria-hidden="true"${cls ? ` class="${cls}"` : ""}>${body}</svg>`;
/** Messages app tile: green gradient square, white speech bubble. */
const messagesIcon = svg(
  "0 0 40 40",
  '<defs><linearGradient id="sms-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ee06a"/><stop offset="1" stop-color="#1fb53a"/></linearGradient></defs><rect width="40" height="40" rx="9" fill="url(#sms-tile)"/><path fill="#fff" d="M20 9c-7.2 0-13 4.7-13 10.5 0 3.3 1.9 6.2 4.8 8.1-.2 1.6-.9 3-2 4.1 2.4-.2 4.5-1.1 6.1-2.4 1.3.3 2.7.5 4.1.5 7.2 0 13-4.7 13-10.5S27.2 9 20 9z"/>',
);
export const signalIcon = svg(
  "0 0 18 12",
  '<rect x="0" y="8" width="3" height="4" rx=".8" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx=".8" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx=".8" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx=".8" fill="currentColor"/>',
);
export const wifiIcon = svg(
  "0 0 16 12",
  '<path fill="currentColor" d="M8 9.4a1.6 1.6 0 0 1 1.6 1.6A1.6 1.6 0 0 1 8 12.6a1.6 1.6 0 0 1-1.6-1.6A1.6 1.6 0 0 1 8 9.4zm0-4.2c1.9 0 3.6.8 4.8 2l-1.5 1.5A4.7 4.7 0 0 0 8 7.3c-1.3 0-2.4.5-3.3 1.4L3.2 7.2A6.8 6.8 0 0 1 8 5.2zM8 1c3 0 5.8 1.2 7.8 3.2l-1.5 1.5A8.9 8.9 0 0 0 8 3.1a8.9 8.9 0 0 0-6.3 2.6L.2 4.2A11 11 0 0 1 8 1z"/>',
);
export const batteryIcon = svg(
  "0 0 27 12",
  '<rect x=".5" y=".5" width="23" height="11" rx="3" fill="none" stroke="currentColor" stroke-opacity=".4"/><rect x="2" y="2" width="17" height="8" rx="1.6" fill="currentColor"/><path fill="currentColor" fill-opacity=".4" d="M25 4v4a2 2 0 0 0 0-4z"/>',
);
const chevronLeft = svg(
  "0 0 12 20",
  '<path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
);
const closeIcon = svg(
  "0 0 10 10",
  '<path d="m1.5 1.5 7 7m0-7-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
);
const chevronRight = svg(
  "0 0 8 12",
  '<path d="m2 1 4 5-4 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
);
/** Notification banner as it drops onto the driver's lock screen. Swipe up or
 * tap to dismiss; pointers that can hover also get the close dot. */
export function smsBannerHtml(booking: string, pin: string, dock = 3): string {
  const body = smsLines(booking, pin, dock).map(esc).join("\n");
  return `<button type="button" class="sms-banner__close" aria-label="${esc(t("sms.dismiss"))}">${closeIcon}</button><span class="sms-banner__icon">${messagesIcon}</span><span class="sms-banner__text"><span class="sms-banner__row"><b>${esc(SMS_SENDER)}</b><time>${esc(t("sms.now"))}</time></span><span class="sms-banner__body">${body}</span></span>`;
}
/** A handset opened on the Messages thread with the Peripass SMS. Sizes inside
 * the screen use container-query units, so the phone scales with its width. */
export function phoneHtml(
  booking: string,
  pin: string,
  receivedAt: string,
  dock = 3,
  now = clock(),
): string {
  const lines = smsLines(booking, pin, dock);
  const [intro, , outro] = lines;
  // The PIN line is rendered as label + bold digits; split the copy around them.
  const pinLabel = lines[1].replace(pin, "").trimEnd();
  return `<div class="phone" role="img" aria-label="${esc(t("sms.phoneAria", { sender: SMS_SENDER, body: lines.join(" ") }))}"><div class="phone__body"><div class="phone__screen"><div class="phone__status"><span class="phone__clock">${esc(now)}</span><span class="phone__island"></span><span class="phone__signal">${signalIcon}${wifiIcon}${batteryIcon}</span></div><div class="phone__head"><span class="phone__back">${chevronLeft}</span><span class="phone__avatar">${esc(SMS_SENDER[0])}</span><span class="phone__contact">${esc(SMS_SENDER)}${chevronRight}</span></div><div class="phone__thread"><span class="phone__stamp"><b>${esc(t("sms.today"))}</b> ${esc(receivedAt)}</span><div class="phone__bubble"><p>${esc(intro)}</p><p class="phone__pin">${esc(pinLabel)} <b>${esc(pin)}</b></p><p>${esc(outro)}</p></div></div><div class="phone__compose"><span class="phone__plus">+</span><span class="phone__field">${esc(t("sms.compose"))}</span></div><span class="phone__homebar"></span></div></div></div>`;
}
