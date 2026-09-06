/** DOM for the self-service kiosk. Mirrors the production kiosk's page anatomy:
 * navigation rails (or an inline bar on phone-sized screens), page head, option
 * cards, reference and phone forms, message endscreen, in-screen overlays.
 * The reference step also offers the camera: a viewfinder in which the driver
 * drags the delivery note into the frame, the kiosk detects the reference and
 * reads the document before moving on.
 */
import {
  COUNTRIES,
  PROFILES,
  type Flow,
  type Method,
  type Profile,
  back,
  country,
  createFlow,
  detectScan,
  finishScan,
  formatPhone,
  fullReference,
  isValidPhone,
  previousStep,
  referenceBody,
  referencePrefix,
  selectLanguage,
  selectMethod,
  selectProfile,
  startScan,
  submitPhone,
  submitReference,
} from "./flow";
import { LANGUAGES, type StringKey, t } from "./i18n";
import { flags, icons } from "./icons";
export type KioskOptions = {
  booking: string;
  onQuit: () => void;
  onComplete: (reference: string) => void;
};
export type KioskController = { flow: Flow; destroy(): void };
type Overlay = null | "help" | "leave" | "country";
/** Guidance states of the viewfinder, named after the production kiosk's Document Capture. */
type ScanStatus = "searching" | "aligning" | "holding" | "ready";
type ScanState = {
  status: ScanStatus;
  /** Offset of the delivery note from the centre of the camera feed, in px. */
  x: number;
  y: number;
  /** The first layout puts the reference half outside the frame. */
  placed: boolean;
  introSeen: boolean;
  hold?: ReturnType<typeof setTimeout>;
  ready?: ReturnType<typeof setTimeout>;
  capture?: ReturnType<typeof setTimeout>;
};
/** Outline colours per capture status, as in the production kiosk. */
const SCAN_COLORS: Record<ScanStatus, string> = {
  searching: "#4d9be8",
  aligning: "#e8a33d",
  holding: "#4d9be8",
  ready: "#3fbf6f",
};
const SCAN_HOLD_MS = 900;
const SCAN_READY_MS = 450;
const SCAN_CAPTURE_MS = 380;
const SCAN_INTRO_MS = 2500;
const VERIFY_MS = 1000;
/** Status pictograms of the guidance pill: a white document with a coloured accent. */
function scanIcon(status: ScanStatus) {
  const doc =
    '<rect x="7" y="4" width="12" height="18" rx="1.5" fill="#fff" opacity=".9"/>';
  const c = SCAN_COLORS[status];
  const accent = {
    searching: `<path d="M4 8V4.5h4M18 4.5h4V8M22 18v3.5h-4M8 21.5H4V18" stroke="${c}" stroke-width="1.6"/>`,
    aligning: `<path d="M5 13H1.5m0 0 2-2m-2 2 2 2M21 13h3.5m0 0-2-2m2 2-2 2" stroke="${c}" stroke-width="1.6"/>`,
    holding: `<circle cx="7" cy="13" r="2.6" fill="${c}"/><circle cx="19" cy="13" r="2.6" fill="${c}"/>`,
    ready: `<circle cx="19" cy="19" r="5.5" fill="${c}"/><path d="m16.5 19 1.8 1.8 3.2-3.4" stroke="#fff" stroke-width="1.6"/>`,
  }[status];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">${doc}${accent}</svg>`;
}
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const PROFILE_ICONS: Record<Profile, string> = {
  inbound: icons.truckIn,
  outbound: icons.truckOut,
  contractor: icons.hardHat,
};
const PROFILE_KEYS: Record<Profile, [StringKey, StringKey]> = {
  inbound: ["profileInboundTitle", "profileInboundDescription"],
  outbound: ["profileOutboundTitle", "profileOutboundDescription"],
  contractor: ["profileContractorTitle", "profileContractorDescription"],
};
/** Phone-sized viewports run the Mobile Driver Portal; anything larger is a physical kiosk. */
export const isMobileDriverPortal = () =>
  window.innerWidth < 760 || window.innerHeight < 560;
export function mountKiosk(
  root: HTMLElement,
  opts: KioskOptions,
): KioskController {
  const flow = createFlow(opts.booking);
  let overlay: Overlay = null,
    paperOpen = false,
    countrySearch = "",
    phoneError = false,
    locked = false,
    scan: ScanState | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    verifyTimer: ReturnType<typeof setTimeout> | undefined;
  root.innerHTML = `<div class="kiosk-stage" role="dialog" aria-modal="true" aria-label="Driver check-in kiosk" tabindex="-1"><div class="kiosk-device"><div class="kiosk-frame"></div></div>${paperHtml(opts.booking)}</div>`;
  const stage = root.firstElementChild as HTMLElement;
  const frame = stage.querySelector<HTMLElement>(".kiosk-frame")!;
  const paperWrap = stage.querySelector<HTMLElement>(".kiosk-paper-wrap")!;
  const paperTab = stage.querySelector<HTMLButtonElement>(".kiosk-paper__tab")!;
  const paperToggles = [
    ...stage.querySelectorAll<HTMLButtonElement>("[data-paper-toggle]"),
  ];
  const mdp = () => stage.dataset.mode === "mdp";
  // On phones the delivery note is a drawer on the right, offered only while the
  // reference is typed. It never dims or blocks the kiosk, so the driver can read
  // and type at the same time.
  const setPaper = (open: boolean) => {
    paperOpen = open;
    stage.dataset.paper = open ? "open" : "closed";
    paperWrap.classList.toggle("is-open", open);
    // The closed drawer nudges in and out until the driver has found it once.
    if (open) paperWrap.classList.remove("is-nudging");
    for (const b of paperToggles) b.setAttribute("aria-expanded", String(open));
    paperTab.innerHTML = `${open ? icons.chevronRight : icons.chevronLeft}<span>Delivery note</span>`;
  };
  const applyMode = () => {
    const mode = isMobileDriverPortal() ? "mdp" : "physical";
    if (stage.dataset.mode === mode) return;
    stage.dataset.mode = mode;
    if (mode === "physical") setPaper(false);
  };
  applyMode();
  paperWrap.classList.add("is-nudging");
  setPaper(false);
  window.addEventListener("resize", applyMode);
  // Swipe: the drawer follows the finger and settles by distance or flick speed.
  let drag: {
    startX: number;
    base: number;
    lastX: number;
    lastT: number;
    velocity: number;
    moved: boolean;
    tap: boolean;
  } | null = null;
  paperWrap.onpointerdown = (e) => {
    if (!mdp() || e.button !== 0) return;
    // Keep focus (and the phone keyboard) on the kiosk input.
    e.preventDefault();
    drag = {
      startX: e.clientX,
      base: paperOpen ? 0 : paperWrap.offsetWidth,
      lastX: e.clientX,
      lastT: e.timeStamp,
      velocity: 0,
      moved: false,
      tap: !!(e.target as Element).closest("[data-paper-toggle]"),
    };
    paperWrap.classList.remove("is-nudging");
    paperWrap.classList.add("is-dragging");
  };
  const onDragMove = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 6) drag.moved = true;
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = (e.clientX - drag.lastX) / dt;
    drag.lastX = e.clientX;
    drag.lastT = e.timeStamp;
    const width = paperWrap.offsetWidth;
    const offset = Math.min(Math.max(drag.base + dx, 0), width);
    paperWrap.style.transform = `translateX(${offset}px)`;
  };
  const onDragEnd = (e: PointerEvent) => {
    if (!drag) return;
    const { moved, velocity, startX, tap } = drag;
    const dx = e.clientX - startX;
    const width = paperWrap.offsetWidth;
    drag = null;
    paperWrap.classList.remove("is-dragging");
    paperWrap.style.transform = "";
    if (!moved) {
      if (tap && e.type === "pointerup") setPaper(!paperOpen);
      return;
    }
    setPaper(
      paperOpen
        ? !(dx > width * 0.3 || velocity > 0.6)
        : dx < -width * 0.25 || velocity < -0.6,
    );
  };
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragEnd);
  // Pointer taps are handled on release; only keyboard activation reaches click.
  paperWrap.onclick = (e) => {
    if (!(e.target as Element).closest("[data-paper-toggle]")) return;
    e.preventDefault();
    if (e.detail === 0 && mdp()) setPaper(!paperOpen);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && paperOpen && mdp()) {
      e.preventDefault();
      e.stopPropagation();
      setPaper(false);
    }
  };
  window.addEventListener("keydown", onKeyDown, true);
  const L = () => flow.language;
  const $ = <T extends Element = HTMLElement>(sel: string) =>
    frame.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string) => [
    ...frame.querySelectorAll<T>(sel),
  ];
  function finish() {
    opts.onComplete(fullReference(flow.booking, flow.reference));
  }
  function quit() {
    opts.onQuit();
  }
  function navButtons(mode: "fixed" | "inline") {
    const prev = previousStep(flow);
    const backLabel = t(
      L(),
      prev === "language" ? "chooseLanguage" : "previousStep",
    );
    const backBtn = prev
      ? `<button type="button" class="kiosk-nav-back" data-action="back" aria-label="${esc(backLabel)}">${icons.chevronLeft}<span class="kiosk-nav-label">${esc(backLabel)}</span></button>`
      : "";
    const help = `<button type="button" class="kiosk-nav-help" data-action="help" aria-label="${esc(t(L(), "help"))}">${icons.circleHelp}<span>${esc(t(L(), "help"))}</span></button>`;
    const home = `<button type="button" class="kiosk-nav-home" data-action="home" aria-label="${esc(t(L(), "quitRegistration"))}">${icons.home}</button>`;
    if (mode === "inline")
      return `<nav class="kiosk-navigation kiosk-navigation--inline" aria-label="Page navigation"><div class="kiosk-navigation__group">${backBtn}</div><div class="kiosk-navigation__group">${help}${home}</div><span class="kiosk-navigation__ghost" aria-hidden="true"></span></nav>`;
    return `<nav class="kiosk-navigation kiosk-navigation--fixed kiosk-navigation--left" aria-label="Page navigation left">${backBtn}</nav><nav class="kiosk-navigation kiosk-navigation--fixed kiosk-navigation--right" aria-label="Page navigation right">${help}${home}</nav>`;
  }
  const option = (kind: string, value: string, body: string, extraClass = "") =>
    `<button type="button" role="option" aria-selected="false" class="kiosk-option ${extraClass}" data-select="${kind}" data-value="${value}"><span class="kiosk-option__body">${body}</span><span class="kiosk-option__check">${icons.circleCheck}</span></button>`;
  const head = (title: string, description?: string, extra = "") =>
    `<div class="kiosk-page-head ${extra}"><h1 class="kiosk-page-title" tabindex="-1">${title}</h1>${description ? `<h2 class="kiosk-page-description">${description}</h2>` : ""}</div>`;
  function languagePage() {
    const items = LANGUAGES.map((l) =>
      option(
        "language",
        l.code,
        `${flags[l.flag]}<span class="kiosk-option__text"><span>${l.native}</span>${l.native === l.english ? "" : `<small>(${l.english})</small>`}</span>`,
        "kiosk-option--language",
      ),
    ).join("");
    return `<div class="kiosk-language-page"><div class="kiosk-language-page__banner"><div class="kiosk-tenant-logo">YARD SHIFT<small>LOGISTICS · GHENT</small></div></div><div class="kiosk-language-page__body"><div>${head(t("en", "welcome"), t("en", "selectLanguage"), "kiosk-page-head--language")}<div class="kiosk-options kiosk-options--languages" role="listbox" aria-label="Language">${items}</div></div><img class="kiosk-language-page__logo" src="/brand/peripass.svg" alt="Peripass"></div></div>`;
  }
  function methodPage() {
    const card = (
      value: Method,
      icon: string,
      title: StringKey,
      desc: StringKey,
    ) =>
      option(
        "method",
        value,
        `<span class="kiosk-option__media kiosk-option__media--tall">${icon}</span><span class="kiosk-option__text"><span class="kiosk-option__title">${esc(t(L(), title))}</span><span class="kiosk-option__description">${esc(t(L(), desc))}</span></span>`,
        "kiosk-option--card",
      );
    return `${head(esc(t(L(), "methodTitle")))}<div class="kiosk-options-wrap"><div class="kiosk-options kiosk-options--two" role="listbox">${card("reference", icons.enterReference, "methodReferenceTitle", "methodReferenceDescription")}${card("stepByStep", icons.stepByStep, "methodStepByStepTitle", "methodStepByStepDescription")}</div></div>`;
  }
  function profilePage() {
    const items = PROFILES.map((p) =>
      option(
        "profile",
        p,
        `<span class="kiosk-option__media">${PROFILE_ICONS[p]}</span><span class="kiosk-option__text"><span class="kiosk-option__title">${esc(t(L(), PROFILE_KEYS[p][0]))}</span><span class="kiosk-option__description">${esc(t(L(), PROFILE_KEYS[p][1]))}</span></span>`,
        "kiosk-option--profile",
      ),
    ).join("");
    return `${head(esc(t(L(), "profileTitle")))}<div class="kiosk-options-wrap"><div class="kiosk-options" role="listbox">${items}</div></div>`;
  }
  const noMatchHtml = () =>
    flow.attempted
      ? `<p class="is-headline">${t(L(), "referenceNoMatch", { reference: `<span class="kiosk-reference-code">${esc(flow.attempted)}</span>` })}</p><p>${esc(t(L(), "referenceNoMatchDetail"))}</p>`
      : "";
  function referencePage() {
    const prefix = referencePrefix(flow.booking);
    return `${head(esc(t(L(), "referenceTitle")), esc(t(L(), "referenceDescription")))}<form class="kiosk-form" novalidate data-form="reference"><div class="kiosk-field"><div class="kiosk-input-wrap ${flow.reference ? "has-value" : ""}">${prefix ? `<div class="kiosk-prefix" aria-hidden="true">${esc(prefix)}</div>` : ""}<input class="kiosk-input kiosk-input--reference" name="reference" value="${esc(flow.reference)}" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" maxlength="32" aria-label="${esc(t(L(), "referenceTitle"))}"><button type="button" class="kiosk-input-clear" data-action="clear" aria-label="${esc(t(L(), "clear"))}">${icons.circleX}</button></div><button class="kiosk-btn" type="submit" data-submit ${flow.reference.trim() ? "" : "disabled"}><span>${esc(t(L(), "continue"))}</span>${icons.chevronRight}</button><button type="button" class="kiosk-btn kiosk-btn--outline kiosk-btn--scan" data-action="scan">${icons.scan}<span>${esc(t(L(), "scanDocument"))}</span></button></div><div class="kiosk-alert" role="alert" data-alert ${flow.attempted ? "" : "hidden"}>${icons.circleAlert}<div data-alert-body>${noMatchHtml()}</div></div><div class="kiosk-extra-info kiosk-extra-info--divided kiosk-rich"><b>${esc(t(L(), "referenceExtraTitle"))}</b><p>${esc(t(L(), "referenceExtraBody", { prefix: prefix || referenceBody(flow.booking).slice(0, 2) }))}</p></div></form>`;
  }
  /** Camera viewfinder: dimmed feed, a clear frame in the middle, the delivery
   *  note lying half outside it. The driver drags the note until the reference
   *  box sits inside the frame; the kiosk then asks to hold still and captures. */
  function scanPage() {
    const s = scan!;
    const intro = s.introSeen
      ? ""
      : `<div class="kiosk-scan__intro" data-scan-intro><div class="kiosk-scan__intro-card"><svg xmlns="http://www.w3.org/2000/svg" width="72" height="52" viewBox="0 0 72 52" fill="none" aria-hidden="true"><rect x="20" y="4" width="32" height="42" rx="2" fill="#fff" opacity=".95"/><rect x="26" y="12" width="20" height="3" rx="1.5" fill="#8f8b7e"/><rect x="26" y="19" width="16" height="2.5" rx="1.25" fill="#b8b4a8"/><rect x="26" y="25" width="18" height="2.5" rx="1.25" fill="#b8b4a8"/><rect x="26" y="33" width="20" height="8" rx="1.5" fill="#00a88c" opacity=".85"/><path d="M6 26h9m0 0-3-3m3 3-3 3M66 26h-9m0 0 3-3m-3 3 3 3" stroke="#3fbf6f" stroke-width="2" stroke-linecap="round"/></svg><div><p>${esc(t(L(), "scanIntroTitle"))}</p><small>${esc(t(L(), "scanIntroSubtitle"))}</small></div></div></div>`;
    return `<div class="kiosk-scan" data-scan data-status="${s.status}"><div class="kiosk-scan__feed" data-scan-feed tabindex="0" role="application" aria-roledescription="camera" aria-label="${esc(t(L(), "scanIntroTitle"))}"><div class="kiosk-scan__doc" data-scan-doc>${paperArticleHtml(flow.booking, false)}</div><div class="kiosk-scan__quad" data-scan-quad hidden><i></i><i></i><i></i><i></i></div><div class="kiosk-scan__window" data-scan-window aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="kiosk-scan__flash" data-scan-flash></div><div class="kiosk-scan__pill" role="status" data-scan-pill>${scanIcon(s.status)}<span>${esc(t(L(), scanStatusKey(s.status)))}</span></div>${intro}</div></div>`;
  }
  const scanStatusKey = (status: ScanStatus): StringKey =>
    (
      ({
        searching: "scanSearching",
        aligning: "scanAligning",
        holding: "scanHolding",
        ready: "scanReady",
      }) as const
    )[status];
  /** The production kiosk's "we're scanning your document" page. */
  function verifyingPage() {
    return `${head(esc(t(L(), "verifyingTitle")), esc(t(L(), "verifyingDescription")))}<div class="kiosk-verifying" aria-busy="true"><span class="kiosk-verifying__device">${icons.scanner}</span><span class="kiosk-verifying__spinner">${icons.loader}</span></div>`;
  }
  function phonePage() {
    const c = country(flow.phoneCountry);
    const valid = isValidPhone(flow.phoneNumber);
    const f = formatPhone(c.iso2, flow.phoneNumber);
    return `${head(esc(t(L(), "phoneTitle")), esc(t(L(), "phoneDescription")))}<form class="kiosk-form" novalidate data-form="phone"><div class="kiosk-phone-row"><button type="button" class="kiosk-input kiosk-country" data-action="country" aria-label="${esc(t(L(), "selectCountryCode"))}">${flags[c.iso2]}<b>+${c.dialCode}</b>${icons.chevronDown}</button><div class="kiosk-input-wrap ${flow.phoneNumber ? "has-value" : ""}"><input class="kiosk-input" type="tel" name="phone" inputmode="tel" autocomplete="off" enterkeyhint="go" placeholder="${esc(c.example)}" value="${esc(flow.phoneNumber)}" aria-label="${esc(t(L(), "phoneTitle"))}"><button type="button" class="kiosk-input-clear" data-action="clear" aria-label="${esc(t(L(), "clear"))}">${icons.circleX}</button></div></div><p class="kiosk-form-error" role="alert" data-error ${phoneError ? "" : "hidden"}>${esc(t(L(), "phoneInvalid"))}</p><button class="kiosk-btn kiosk-btn--phone" type="submit" data-submit ${flow.phoneNumber.trim() ? "" : "disabled"}><span>${esc(t(L(), "continue"))}</span>${icons.chevronRight}</button><div class="kiosk-confirmation" data-confirmation ${valid && !phoneError ? "" : "hidden"}>${icons.check}<div><b data-national>${esc(f.national)}</b><small data-international>${esc(f.international)}</small></div></div><div class="kiosk-extra-info kiosk-rich"><b>${esc(t(L(), "phoneDemoTitle"))}</b><p>${esc(t(L(), "phoneDemoBody"))}</p></div></form>`;
  }
  function endscreenPage() {
    const f = formatPhone(flow.phoneCountry, flow.phoneNumber);
    return `<div class="kiosk-message"><div class="kiosk-message__icon">${icons.circleCheck}</div><h1 class="kiosk-page-title" tabindex="-1">${esc(t(L(), "endTitle"))}</h1><div class="kiosk-confirmation">${icons.check}<div><b>${esc(t(L(), "smsConfirmed"))}</b><small>${esc(f.international)}</small></div></div><div class="kiosk-extra-info"><p>${esc(t(L(), "endBody"))}</p></div><div class="kiosk-message__actions"><button type="button" class="kiosk-btn kiosk-btn--outline" data-action="finish">${icons.home}<span>${esc(t(L(), "home"))}</span></button></div></div>`;
  }
  const countryItems = () => {
    const q = countrySearch.trim().toLowerCase();
    return COUNTRIES.filter(
      (c) =>
        !q || c.name.toLowerCase().includes(q) || `+${c.dialCode}`.includes(q),
    )
      .map(
        (c) =>
          `<button type="button" class="kiosk-country-item ${c.iso2 === flow.phoneCountry ? "is-on" : ""}" data-select="country" data-value="${c.iso2}"><span>${flags[c.iso2]}<span>${c.name}</span></span><b>+${c.dialCode}</b></button>`,
      )
      .join("");
  };
  function overlayHtml() {
    if (!overlay) return "";
    const close = `<button type="button" class="kiosk-close" data-action="close" aria-label="${esc(t(L(), "close"))}">${icons.x}</button>`;
    let inner = "";
    if (overlay === "help")
      inner = `${head(esc(t(L(), "helpTitle")), esc(t(L(), "helpBody")))}<div class="kiosk-card__actions"><button type="button" class="kiosk-btn kiosk-btn--outline" data-action="close">${esc(t(L(), "close"))}</button></div>`;
    else if (overlay === "leave")
      inner = `${head(esc(t(L(), "leaveTitle")), esc(t(L(), "leaveDescription")))}<div class="kiosk-sheet__actions"><button type="button" class="kiosk-btn" data-action="quit">${esc(t(L(), "leaveConfirm"))}</button><button type="button" class="kiosk-btn kiosk-btn--secondary" data-action="close">${esc(t(L(), "leaveCancel"))}</button></div>`;
    else
      inner = `${mdp() ? head(esc(t(L(), "selectCountryCode"))) : ""}<div class="kiosk-input-wrap kiosk-search-wrap"><span class="kiosk-search-icon">${icons.search}</span><input class="kiosk-input" data-search placeholder="${esc(t(L(), "searchCountry"))}" value="${esc(countrySearch)}" autocomplete="off" aria-label="${esc(t(L(), "searchCountry"))}"></div><div class="kiosk-country-list" data-country-list>${countryItems()}</div>`;
    if (mdp() || overlay === "leave")
      return `<div class="kiosk-overlay kiosk-overlay--sheet" data-overlay><div class="kiosk-sheet" role="dialog" aria-modal="true">${close}${inner}</div></div>`;
    if (overlay === "country")
      return `<div class="kiosk-overlay" data-overlay role="dialog" aria-modal="true" aria-label="${esc(t(L(), "selectCountryCode"))}"><div class="kiosk-overlay__content">${inner}</div></div>`;
    return `<div class="kiosk-overlay" data-overlay><div class="kiosk-overlay__content"><div class="kiosk-card" role="dialog" aria-modal="true">${inner}</div></div></div>`;
  }
  function resetScan() {
    if (!scan) return;
    clearTimeout(scan.hold);
    clearTimeout(scan.ready);
    clearTimeout(scan.capture);
    scan = null;
  }
  function wireScan(feed: HTMLElement) {
    const s = scan!;
    const root = feed.closest<HTMLElement>("[data-scan]")!;
    const doc = feed.querySelector<HTMLElement>("[data-scan-doc]")!;
    const ref = doc.querySelector<HTMLElement>(".kiosk-paper__reference")!;
    const win = feed.querySelector<HTMLElement>("[data-scan-window]")!;
    const quad = feed.querySelector<HTMLElement>("[data-scan-quad]")!;
    const pill = feed.querySelector<HTMLElement>("[data-scan-pill]")!;
    const intro = feed.querySelector<HTMLElement>("[data-scan-intro]");
    const place = () => {
      doc.style.transform = `translate(-50%, -50%) translate(${s.x}px, ${s.y}px) rotate(-4deg) scale(var(--doc-scale, 1))`;
    };
    const clamp = () => {
      // Keep at least a quarter of the note inside the feed so it cannot get lost.
      const f = feed.getBoundingClientRect(),
        d = doc.getBoundingClientRect();
      const mx = f.width / 2 + d.width * 0.25,
        my = f.height / 2 + d.height * 0.25;
      s.x = Math.min(Math.max(s.x, -mx), mx);
      s.y = Math.min(Math.max(s.y, -my), my);
    };
    place();
    if (!s.placed) {
      // Start with the reference box straddling the frame's lower-right corner.
      const w = win.getBoundingClientRect(),
        r = ref.getBoundingClientRect();
      s.x += w.right - r.width * 0.55 - r.left;
      s.y += w.bottom - r.height * 0.45 - r.top;
      s.placed = true;
      place();
    }
    const setStatus = (status: ScanStatus) => {
      if (s.status === status) return;
      s.status = status;
      root.dataset.status = status;
      pill.innerHTML = `${scanIcon(status)}<span>${esc(t(L(), scanStatusKey(status)))}</span>`;
    };
    const stopHold = () => {
      clearTimeout(s.hold);
      clearTimeout(s.ready);
      s.hold = s.ready = undefined;
    };
    const capture = () => {
      stopHold();
      feed.querySelector("[data-scan-flash]")?.classList.add("is-on");
      s.capture = setTimeout(() => {
        resetScan();
        if (!detectScan(flow)) return;
        render();
        verifyTimer = setTimeout(() => {
          if (finishScan(flow)) render();
        }, VERIFY_MS);
      }, SCAN_CAPTURE_MS);
    };
    /** Compare the reference box with the frame and drive the guidance state. */
    const evaluate = (moved: boolean) => {
      if (s.capture) return;
      const f = feed.getBoundingClientRect(),
        w = win.getBoundingClientRect(),
        r = ref.getBoundingClientRect();
      const overlaps =
        r.right > w.left &&
        r.left < w.right &&
        r.bottom > w.top &&
        r.top < w.bottom;
      const inside =
        r.left >= w.left - 2 &&
        r.right <= w.right + 2 &&
        r.top >= w.top - 2 &&
        r.bottom <= w.bottom + 2;
      // The outline only appears once the reference sits inside the frame;
      // while it is still being moved the pill alone gives directions.
      quad.toggleAttribute("hidden", !inside);
      if (inside) {
        quad.style.left = `${r.left - f.left}px`;
        quad.style.top = `${r.top - f.top}px`;
        quad.style.width = `${r.width}px`;
        quad.style.height = `${r.height}px`;
      }
      if (!inside) {
        stopHold();
        setStatus(overlaps ? "aligning" : "searching");
        return;
      }
      if (s.status === "ready") return;
      if (moved || !s.hold) {
        // Any movement restarts the hold; a steady note is captured after it.
        stopHold();
        s.hold = setTimeout(() => {
          setStatus("ready");
          s.ready = setTimeout(capture, SCAN_READY_MS);
        }, SCAN_HOLD_MS);
      }
      setStatus("holding");
    };
    const dismissIntro = () => {
      if (s.introSeen) return;
      s.introSeen = true;
      intro?.classList.add("is-hidden");
    };
    if (intro) setTimeout(dismissIntro, SCAN_INTRO_MS);
    let pointer: { id: number; x: number; y: number } | null = null;
    feed.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      feed.setPointerCapture(e.pointerId);
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      doc.classList.add("is-lifted");
      dismissIntro();
    };
    feed.onpointermove = (e) => {
      if (!pointer || e.pointerId !== pointer.id) return;
      const dx = e.clientX - pointer.x,
        dy = e.clientY - pointer.y;
      if (!dx && !dy) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      s.x += dx;
      s.y += dy;
      clamp();
      place();
      evaluate(Math.abs(dx) + Math.abs(dy) > 1.5);
    };
    feed.onpointerup = feed.onpointercancel = (e) => {
      if (!pointer || e.pointerId !== pointer.id) return;
      pointer = null;
      doc.classList.remove("is-lifted");
      evaluate(false);
    };
    feed.onkeydown = (e) => {
      const step = {
        ArrowLeft: [-16, 0],
        ArrowRight: [16, 0],
        ArrowUp: [0, -16],
        ArrowDown: [0, 16],
      }[e.key];
      if (!step) return;
      e.preventDefault();
      dismissIntro();
      s.x += step[0];
      s.y += step[1];
      clamp();
      place();
      evaluate(true);
    };
    evaluate(false);
  }
  function render() {
    const pages = {
      language: languagePage,
      method: methodPage,
      profile: profilePage,
      reference: referencePage,
      scan: scanPage,
      verifying: verifyingPage,
      phone: phonePage,
      endscreen: endscreenPage,
    };
    const isLanguage = flow.step === "language";
    stage.toggleAttribute("data-overlay", !!overlay);
    stage.dataset.step = flow.step;
    if (overlay || flow.step !== "reference") setPaper(false);
    frame.innerHTML = `<div class="kiosk-page-layout ${isLanguage ? "kiosk-page-layout--language" : ""} ${flow.step === "scan" ? "kiosk-page-layout--scan" : ""}" data-step="${flow.step}" lang="${flow.step === "language" ? "en" : flow.language}">${isLanguage ? "" : navButtons("fixed")}<div class="kiosk-page-layout__scroll"><div class="kiosk-scroll-content">${isLanguage ? "" : `<div class="kiosk-mobile-navigation">${navButtons("inline")}</div>`}<div class="kiosk-page">${pages[flow.step]()}</div></div></div>${overlayHtml()}</div>`;
    wire();
  }
  function selectWithLock(button: HTMLButtonElement, apply: () => void) {
    if (locked) return;
    locked = true;
    for (const b of $$<HTMLButtonElement>(".kiosk-option")) b.disabled = true;
    button.classList.add("is-on");
    button.setAttribute("aria-selected", "true");
    timer = setTimeout(() => {
      locked = false;
      apply();
      render();
    }, 220);
  }
  function wire() {
    for (const b of $$<HTMLButtonElement>("[data-action]"))
      b.onclick = (e) => {
        e.preventDefault();
        const action = b.dataset.action;
        if (action === "back") {
          resetScan();
          back(flow);
          phoneError = false;
          render();
        } else if (action === "scan") {
          if (startScan(flow)) {
            scan = {
              status: "searching",
              x: 0,
              y: 0,
              placed: false,
              introSeen: false,
            };
            render();
          }
        } else if (action === "home") {
          if (flow.step === "endscreen") finish();
          else if (mdp()) {
            overlay = "leave";
            render();
          } else quit();
        } else if (action === "help") {
          overlay = "help";
          render();
        } else if (action === "close") {
          overlay = null;
          countrySearch = "";
          render();
        } else if (action === "quit") quit();
        else if (action === "finish") finish();
        else if (action === "country") {
          overlay = "country";
          render();
          $<HTMLInputElement>("[data-search]")?.focus();
        }
      };
    const overlayEl = $("[data-overlay]");
    if (overlayEl)
      overlayEl.onclick = (e) => {
        if (e.target === overlayEl) {
          overlay = null;
          countrySearch = "";
          render();
        }
      };
    for (const b of $$<HTMLButtonElement>("[data-select]"))
      b.onclick = () => {
        const value = b.dataset.value!;
        switch (b.dataset.select) {
          case "language":
            selectWithLock(b, () => selectLanguage(flow, value));
            break;
          case "method":
            selectWithLock(b, () => selectMethod(flow, value as Method));
            break;
          case "profile":
            selectWithLock(b, () => selectProfile(flow, value as Profile));
            break;
          case "country":
            flow.phoneCountry = value;
            overlay = null;
            countrySearch = "";
            render();
            if (!mdp()) $<HTMLInputElement>('input[name="phone"]')?.focus();
            break;
        }
      };
    const search = $<HTMLInputElement>("[data-search]");
    if (search)
      search.oninput = () => {
        countrySearch = search.value;
        const list = $("[data-country-list]");
        if (list) {
          list.innerHTML = countryItems();
          wireCountryItems();
        }
      };
    const form = $<HTMLFormElement>("[data-form]");
    if (form) {
      const input = form.querySelector<HTMLInputElement>(
        'input[name="reference"], input[name="phone"]',
      )!;
      const wrap = input.closest<HTMLElement>(".kiosk-input-wrap")!;
      const submit = form.querySelector<HTMLButtonElement>("[data-submit]")!;
      const prefix = form.querySelector<HTMLElement>(".kiosk-prefix");
      if (prefix) input.style.paddingLeft = `${prefix.offsetWidth + 8}px`;
      const sync = () => {
        wrap.classList.toggle("has-value", input.value.length > 0);
        submit.disabled = !input.value.trim();
        if (form.dataset.form === "reference") {
          flow.reference = input.value;
          if (flow.attempted) {
            flow.attempted = undefined;
            $("[data-alert]")?.setAttribute("hidden", "");
          }
        } else {
          flow.phoneNumber = input.value;
          phoneError = false;
          $("[data-error]")?.setAttribute("hidden", "");
          const valid = isValidPhone(input.value);
          const box = $("[data-confirmation]");
          if (box) {
            box.toggleAttribute("hidden", !valid);
            const f = formatPhone(flow.phoneCountry, input.value);
            $("[data-national]")!.textContent = f.national;
            $("[data-international]")!.textContent = f.international;
          }
        }
      };
      input.oninput = sync;
      input.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (!submit.disabled) form.requestSubmit();
        }
      };
      const clear = form.querySelector<HTMLButtonElement>(
        "[data-action='clear']",
      )!;
      clear.onpointerdown = (e) => {
        e.preventDefault();
        input.value = "";
        sync();
        input.focus();
      };
      clear.onclick = (e) => e.preventDefault();
      form.onsubmit = (e) => {
        e.preventDefault();
        if (form.dataset.form === "reference") {
          if (submitReference(flow)) render();
          else {
            const alert = $("[data-alert]");
            if (alert && flow.attempted) {
              $("[data-alert-body]")!.innerHTML = noMatchHtml();
              alert.removeAttribute("hidden");
            }
            input.select();
          }
        } else if (submitPhone(flow)) render();
        else {
          phoneError = true;
          $("[data-error]")?.removeAttribute("hidden");
          $("[data-confirmation]")?.setAttribute("hidden", "");
          input.focus();
        }
      };
    }
    const feed = $("[data-scan-feed]");
    if (feed && scan) wireScan(feed);
    // Never auto-focus a control on render; park focus on the stage when the
    // previously focused element was replaced so Escape/Tab still work.
    if (!frame.contains(document.activeElement))
      stage.focus({ preventScroll: true });
    function wireCountryItems() {
      for (const b of $$<HTMLButtonElement>("[data-select='country']"))
        b.onclick = () => {
          flow.phoneCountry = b.dataset.value!;
          overlay = null;
          countrySearch = "";
          render();
          if (!mdp()) $<HTMLInputElement>('input[name="phone"]')?.focus();
        };
    }
  }
  render();
  return {
    flow,
    destroy() {
      clearTimeout(timer);
      clearTimeout(verifyTimer);
      resetScan();
      window.removeEventListener("resize", applyMode);
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", onDragEnd);
      window.removeEventListener("pointercancel", onDragEnd);
      window.removeEventListener("keydown", onKeyDown, true);
      root.replaceChildren();
    },
  };
}
function paperHtml(booking: string) {
  return `<aside class="kiosk-paper-wrap" aria-label="Your paperwork"><button type="button" class="kiosk-paper__tab" data-paper-toggle aria-expanded="false" aria-controls="kiosk-paper">${icons.chevronLeft}<span>Delivery note</span></button>${paperArticleHtml(booking, true)}</aside>`;
}
/** The delivery note itself; the drawer variant carries its Hide button and id. */
function paperArticleHtml(booking: string, drawer: boolean) {
  const prefix = referencePrefix(booking),
    body = referenceBody(booking);
  return `<article class="kiosk-paper" ${drawer ? 'id="kiosk-paper"' : 'aria-hidden="true"'}><header><div class="kiosk-paper__title"><b>DELIVERY NOTE</b><span>CMR · No. 26-09-117</span></div>${drawer ? `<button type="button" class="kiosk-paper__toggle" data-paper-toggle aria-expanded="false" aria-controls="kiosk-paper"><span>Hide</span>${icons.chevronRight}</button>` : ""}</header><dl><dt>Carrier</dt><dd>Yard Shift Transport bv</dd><dt>Vehicle</dt><dd>1-YRD-048 · 13.6 m trailer</dd><dt>Consignee</dt><dd>Yard Shift Logistics · Ghent</dd><dt>Goods</dt><dd>General cargo · 12 pallets</dd><dt>Time slot</dt><dd>09:30 – 10:00</dd></dl><div class="kiosk-paper__reference"><span>Peripass reference</span><b>${prefix ? `<em>${esc(prefix)}</em>` : ""}${esc(body)}</b><small>Enter this reference at the driver kiosk</small></div><div class="kiosk-paper__stamp">BOOKED</div><footer><span>Driver copy</span><span>Keep with vehicle documents</span></footer></article>`;
}
