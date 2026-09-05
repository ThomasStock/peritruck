/** DOM for the self-service kiosk. Mirrors the production kiosk's page anatomy:
 * navigation rails (or an inline bar on phone-sized screens), page head, option
 * cards, reference and phone forms, message endscreen, in-screen overlays.
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
    timer: ReturnType<typeof setTimeout> | undefined;
  root.innerHTML = `<div class="kiosk-stage" role="dialog" aria-modal="true" aria-label="Driver check-in kiosk"><div class="kiosk-device"><div class="kiosk-frame"></div></div>${paperHtml(opts.booking)}</div>`;
  const stage = root.firstElementChild as HTMLElement;
  const frame = stage.querySelector<HTMLElement>(".kiosk-frame")!;
  const paperWrap = stage.querySelector<HTMLElement>(".kiosk-paper-wrap")!;
  const paper = stage.querySelector<HTMLElement>(".kiosk-paper")!;
  const paperHandle = stage.querySelector<HTMLElement>("[data-paper-handle]")!;
  const paperToggle = stage.querySelector<HTMLButtonElement>(
    "[data-paper-toggle]",
  )!;
  const mdp = () => stage.dataset.mode === "mdp";
  // On phones the paperwork is a sheet tucked into the bottom edge. Only its top
  // strip (grip, title, View) peeks out; the kiosk content pads itself above it.
  let peek = 0;
  const measurePeek = () => {
    peek = paperHandle.offsetTop + paperHandle.offsetHeight;
    stage.style.setProperty("--paper-peek", `${peek}px`);
  };
  const setPaper = (open: boolean) => {
    paperOpen = open;
    stage.dataset.paper = open ? "open" : "closed";
    paperWrap.classList.toggle("is-open", open);
    paperToggle.setAttribute("aria-expanded", String(open));
    paperToggle.innerHTML = `<span>${open ? "Hide" : "View"}</span>${open ? icons.chevronDown : icons.chevronUp}`;
    // A sheet that fits the screen swipes from anywhere; a taller one scrolls and swipes from its header.
    paper.style.touchAction =
      paper.scrollHeight > paper.clientHeight + 1 ? "" : "none";
  };
  const applyMode = () => {
    const mode = isMobileDriverPortal() ? "mdp" : "physical";
    if (stage.dataset.mode !== mode) {
      stage.dataset.mode = mode;
      if (mode === "physical") setPaper(false);
    }
    measurePeek();
  };
  applyMode();
  setPaper(false);
  document.fonts?.ready.then(measurePeek);
  window.addEventListener("resize", applyMode);
  // Swipe: follow the finger, then settle open or tucked by distance or flick speed.
  let drag: {
    startY: number;
    base: number;
    lastY: number;
    lastT: number;
    velocity: number;
    moved: boolean;
  } | null = null;
  let swallowClick = false;
  const tuckedOffset = () => paperWrap.offsetHeight - peek;
  paper.onpointerdown = (e) => {
    if (!mdp() || e.button !== 0) return;
    if (
      !paperHandle.contains(e.target as Node) &&
      paper.scrollHeight > paper.clientHeight + 1
    )
      return;
    drag = {
      startY: e.clientY,
      base: paperOpen ? 0 : tuckedOffset(),
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      moved: false,
    };
    paperWrap.classList.add("is-dragging");
  };
  const onDragMove = (e: PointerEvent) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) > 4) drag.moved = true;
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.velocity = (e.clientY - drag.lastY) / dt;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    const offset = Math.min(Math.max(drag.base + dy, 0), tuckedOffset());
    paperWrap.style.transform = `translateY(${offset}px)`;
  };
  const onDragEnd = (e: PointerEvent) => {
    if (!drag) return;
    const { moved, velocity, startY } = drag;
    const dy = e.clientY - startY;
    drag = null;
    paperWrap.classList.remove("is-dragging");
    paperWrap.style.transform = "";
    if (!moved) return;
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);
    setPaper(
      paperOpen ? !(dy > 60 || velocity > 0.6) : dy < -40 || velocity < -0.6,
    );
  };
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragEnd);
  paperHandle.onclick = () => {
    if (swallowClick) return;
    if (mdp()) setPaper(!paperOpen);
  };
  stage.onclick = (e) => {
    if (e.target === stage && paperOpen) setPaper(false);
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
    return `${head(esc(t(L(), "referenceTitle")), esc(t(L(), "referenceDescription")))}<form class="kiosk-form" novalidate data-form="reference"><div class="kiosk-field"><div class="kiosk-input-wrap ${flow.reference ? "has-value" : ""}">${prefix ? `<div class="kiosk-prefix" aria-hidden="true">${esc(prefix)}</div>` : ""}<input class="kiosk-input kiosk-input--reference" name="reference" value="${esc(flow.reference)}" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go" maxlength="32" aria-label="${esc(t(L(), "referenceTitle"))}"><button type="button" class="kiosk-input-clear" data-action="clear" aria-label="${esc(t(L(), "clear"))}">${icons.circleX}</button></div><button class="kiosk-btn" type="submit" data-submit ${flow.reference.trim() ? "" : "disabled"}><span>${esc(t(L(), "continue"))}</span>${icons.chevronRight}</button></div><div class="kiosk-alert" role="alert" data-alert ${flow.attempted ? "" : "hidden"}>${icons.circleAlert}<div data-alert-body>${noMatchHtml()}</div></div><div class="kiosk-extra-info kiosk-extra-info--divided kiosk-rich"><b>${esc(t(L(), "referenceExtraTitle"))}</b><p>${esc(t(L(), "referenceExtraBody", { prefix: prefix || referenceBody(flow.booking).slice(0, 2) }))}</p></div></form>`;
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
  function render() {
    const pages = {
      language: languagePage,
      method: methodPage,
      profile: profilePage,
      reference: referencePage,
      phone: phonePage,
      endscreen: endscreenPage,
    };
    const isLanguage = flow.step === "language";
    stage.toggleAttribute("data-overlay", !!overlay);
    frame.innerHTML = `<div class="kiosk-page-layout ${isLanguage ? "kiosk-page-layout--language" : ""}" data-step="${flow.step}" lang="${flow.step === "language" ? "en" : flow.language}">${isLanguage ? "" : navButtons("fixed")}<div class="kiosk-page-layout__scroll"><div class="kiosk-scroll-content">${isLanguage ? "" : `<div class="kiosk-mobile-navigation">${navButtons("inline")}</div>`}<div class="kiosk-page">${pages[flow.step]()}</div></div></div>${overlayHtml()}</div>`;
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
          back(flow);
          phoneError = false;
          render();
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
      if (!mdp() && !overlay) input.focus();
    } else if (!overlay) $("h1")?.focus({ preventScroll: true });
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
  const prefix = referencePrefix(booking),
    body = referenceBody(booking);
  return `<aside class="kiosk-paper-wrap" aria-label="Your paperwork"><article class="kiosk-paper"><div class="kiosk-paper__handle" data-paper-handle><i class="kiosk-paper__grip" aria-hidden="true"></i><header><div class="kiosk-paper__title"><b>DELIVERY NOTE</b><span>CMR · No. 26-09-117</span></div><button type="button" class="kiosk-paper__toggle" data-paper-toggle aria-expanded="false" aria-controls="kiosk-paper-body"><span>View</span>${icons.chevronUp}</button></header></div><div class="kiosk-paper__body" id="kiosk-paper-body"><dl><dt>Carrier</dt><dd>Yard Shift Transport bv</dd><dt>Vehicle</dt><dd>1-YRD-048 · 13.6 m trailer</dd><dt>Consignee</dt><dd>Yard Shift Logistics · Ghent</dd><dt>Goods</dt><dd>General cargo · 12 pallets</dd><dt>Time slot</dt><dd>09:30 – 10:00</dd></dl><div class="kiosk-paper__reference"><span>Peripass reference</span><b>${prefix ? `<em>${esc(prefix)}</em>` : ""}${esc(body)}</b><small>Enter this reference at the driver kiosk</small></div><footer><span>Driver copy</span><span>Keep with vehicle documents</span></footer></div><div class="kiosk-paper__stamp">BOOKED</div></article></aside>`;
}
