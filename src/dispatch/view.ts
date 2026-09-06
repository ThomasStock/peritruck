/** DOM for the yard operator's phone. A lock screen catches the Peripass Yard
 * push notification; tapping it opens a replica of the Yard Operator App's
 * dispatch module: the call-off queue, the driver's details with the
 * yard-location picker, and the call-off confirmation. The screen is laid out
 * at a phone's 390 logical pixels and zoomed: inside a handset on wide
 * viewports, filling the viewport on phones. Presentation over flow.ts.
 */
import {
  COPY,
  type Flow,
  type Location,
  another,
  back,
  closeLocations,
  createFlow,
  fail,
  invalidReason,
  notify,
  openApp,
  openLocations,
  openVisitor,
  selectLocation,
  setSearch,
  succeed,
  toggleHideInvalid,
  validate,
  visibleLocations,
  visitorFor,
} from "./flow";
import { dockTiles, homeTiles, icons, peripassTile } from "./icons";
import { batteryIcon, clock, signalIcon, wifiIcon } from "../sms";
export type DispatchOptions = {
  booking: string;
  /** Call the driver off in the simulation. True, or the message to show. */
  onDispatch: (dock: number) => true | string;
  /** The operator has put the phone away; the caller removes the view. */
  onClose: () => void;
  /** The push notification landed: sound and haptics live with the caller. */
  onNotify?: () => void;
};
export type DispatchController = {
  flow: Flow;
  /** Slide the phone away, then remove it. */
  dismiss(): Promise<void>;
  destroy(): void;
};
/** Logical width the screens are designed at; the phone zooms from here. */
export const SCREEN_WIDTH = 390;
/** The lock screen settles before the notification drops. */
const NOTIFY_MS = 900;
/** The app closes the picker half a second after a choice, as production does. */
const SELECT_CLOSE_MS = 500;
/** The call-off request in flight. */
const WORKING_MS = 700;
/** The empty queue is shown before the operator pockets the phone. */
const DONE_MS = 1300;
const ENTER_MS = 450;
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/** Phones and short windows run the app full screen; anything larger holds a handset. */
export const isFullScreen = () =>
  window.innerWidth < 760 || window.innerHeight < 560;
const longDate = (date = new Date()) =>
  date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
const minutesAgo = (minutes: number, now = new Date()) =>
  clock(new Date(now.getTime() - minutes * 60000));
export function mountDispatch(
  root: HTMLElement,
  opts: DispatchOptions,
): DispatchController {
  const flow = createFlow();
  const visitor = visitorFor(opts.booking);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  let working = false,
    filtersOpen = false,
    closing = false;
  root.innerHTML = `<div class="op-stage"><div class="op-phone" role="dialog" aria-modal="true" aria-label="Yard operator's phone" tabindex="-1"><div class="op-phone__body"><div class="op-screen"><div class="op-status"><span class="op-status__clock">${esc(clock())}</span><span class="op-status__island"></span><span class="op-status__signal">${signalIcon}${wifiIcon}${batteryIcon}</span></div><div class="op-content"></div><span class="op-homebar"></span></div></div></div></div>`;
  const stage = root.firstElementChild as HTMLElement;
  const phone = stage.querySelector<HTMLElement>(".op-phone")!;
  const content = phone.querySelector<HTMLElement>(".op-content")!;
  const $ = <T extends Element = HTMLElement>(sel: string) =>
    content.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string) => [
    ...content.querySelectorAll<T>(sel),
  ];
  const applyMode = () => {
    const full = isFullScreen();
    stage.dataset.mode = phone.dataset.mode = full ? "full" : "handset";
    const zoom = full
      ? Math.min(1, window.innerWidth / SCREEN_WIDTH)
      : Math.max(0.42, Math.min(1, (window.innerHeight - 40) / 900));
    phone.style.setProperty("--op-zoom", zoom.toFixed(3));
  };
  applyMode();
  window.addEventListener("resize", applyMode);
  // Home screen -----------------------------------------------------------
  const tile = (t: { name: string; svg: string }, action = "") =>
    `<button type="button" class="op-tile" ${action ? `data-action="${action}"` : "disabled"} aria-label="${esc(t.name)}"><i>${t.svg}</i><small>${esc(t.name)}</small></button>`;
  function homePage() {
    return `<div class="op-home"><div class="op-home__date">${esc(longDate())}</div><div class="op-home__grid">${homeTiles.map((t) => tile(t, t.name === COPY.appName ? "open-app" : "")).join("")}</div><div class="op-home__dock">${dockTiles.map((t) => tile(t)).join("")}</div><div class="op-home__shortcuts"><span>${icons.torch}</span><span>${icons.camera}</span></div><button type="button" class="op-notice ${flow.notified ? "" : "is-out"}" data-action="open-app" aria-live="polite"><span class="op-notice__icon">${peripassTile}</span><span class="op-notice__text"><span class="op-notice__row"><b>${esc(COPY.appName.toUpperCase())}</b><time>now</time></span><span class="op-notice__title">${esc(COPY.notificationTitle)}</span><span class="op-notice__body">${esc(COPY.notificationBody(visitor.name))}</span></span></button></div>`;
  }
  // The app ---------------------------------------------------------------
  const tabs = () =>
    `<nav class="op-tabs" aria-label="Tabs"><span class="op-tab">${icons.tasks}<small>${esc(COPY.tasks)}</small></span><span class="op-tab is-active">${icons.truck}${flow.dispatched === undefined ? '<i class="op-badge">1</i>' : ""}<small>${esc(COPY.callOff)}</small></span><span class="op-tab">${icons.settings}<small>${esc(COPY.settings)}</small></span></nav>`;
  function queuePage() {
    const empty = flow.dispatched !== undefined;
    const header = `<header class="op-header"><h1>${esc(COPY.callOffDrivers)}</h1><span class="op-header__right">${icons.options}</span></header>`;
    const body = empty
      ? `<div class="op-empty"><b>${esc(COPY.allDone)}</b><span>${esc(COPY.nobodyToCallOff)}</span><button type="button" class="op-btn" disabled>${esc(COPY.refresh)}</button></div>`
      : `<h2 class="op-section-title">${esc(COPY.waitingDispatch)} (1)</h2><button type="button" class="op-visitor-card" data-action="open-visitor"><span class="op-visitor-card__type">${icons.liveLoading}</span><span class="op-visitor-card__body"><b>${esc(visitor.name)}</b><small>${esc(COPY.approvedSince("2 minutes ago"))}</small></span></button>`;
    return `<div class="op-app">${header}<div class="op-page op-queue">${body}</div>${tabs()}</div>`;
  }
  function fieldRow(f: (typeof visitor.fields)[number]) {
    const value =
      f.kind === "plate"
        ? `<b class="op-plate">${esc(f.value)}</b>`
        : f.kind === "phone"
          ? `<span class="op-link">${icons.phone}${esc(f.value)}</span>`
          : `<b class="op-field__value">${esc(f.value)}</b>`;
    return `<div class="op-field"><span class="op-field__label">${esc(f.label)}</span>${value}</div>`;
  }
  const locationLabel = (l: Location) => {
    const reason = invalidReason(l);
    return `<span class="op-option__main"><b>${esc(l.name)}</b><span class="op-option__meta">${reason ? `<span class="op-tag op-tag--${reason === "Occupied" ? "occupied" : "oos"}">${esc(reason === "Occupied" ? COPY.occupied : COPY.outOfService)}</span>` : ""}${l.asset ? `<span class="op-asset">${icons.fullDropOffOutline}${esc(l.asset.name)}</span>` : ""}</span></span>`;
  };
  function selectHtml() {
    const chosen = visibleLocations({
      ...flow,
      search: "",
      hideInvalid: false,
    }).find((l) => l.id === flow.selected);
    return `<button type="button" class="op-select ${flow.error ? "has-error" : ""} ${chosen ? "has-value" : ""}" data-action="open-locations" aria-haspopup="listbox" aria-expanded="${flow.sheetOpen}">${chosen ? locationLabel(chosen) : `<span class="op-select__placeholder">${esc(COPY.selectYardLocation)}</span>`}<i class="op-select__chevron">${icons.chevronDown}</i></button>`;
  }
  function listHtml() {
    const rows = visibleLocations(flow);
    if (!rows.length)
      return `<div class="op-sheet__empty">${flow.search.trim() ? `${esc(COPY.nothingFoundFor)} <b>${esc(flow.search.trim())}</b>` : esc(COPY.noResults)}${flow.hideInvalid ? `<small>${esc(COPY.filtersApplied)}</small>` : ""}</div>`;
    return rows
      .map(
        (l) =>
          `<button type="button" role="option" aria-selected="${l.id === flow.selected}" class="op-option ${l.id === flow.selected ? "is-selected" : ""}" data-select="${l.id}">${locationLabel(l)}<i class="op-option__check">${icons.check}</i></button>`,
      )
      .join("");
  }
  function sheetHtml() {
    if (!flow.sheetOpen) return "";
    return `<div class="op-scrim" data-scrim><div class="op-sheet" role="listbox" aria-label="${esc(COPY.selectYardLocation)}"><span class="op-sheet__handle"></span><div class="op-sheet__search"><input class="op-input" data-search type="search" placeholder="${esc(COPY.searchOption)}" value="${esc(flow.search)}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${esc(COPY.searchOption)}"><button type="button" class="op-sheet__filters-toggle" data-action="toggle-filters" aria-label="Filters" aria-expanded="${filtersOpen}">${icons.sliders}${flow.hideInvalid ? '<i class="op-dot"></i>' : ""}</button></div><div class="op-sheet__filters" data-filters ${filtersOpen ? "" : "hidden"}><label class="op-switch-row"><span>${esc(COPY.hideInvalidLocations)}</span><input type="checkbox" role="switch" class="op-switch" data-hide-invalid ${flow.hideInvalid ? "checked" : ""}></label></div><div class="op-sheet__list" data-list>${listHtml()}</div></div></div>`;
  }
  function visitorPage() {
    const now = new Date();
    const stamp = (label: string, relative: string, minutes: number) =>
      `<div class="op-stamp"><b>${esc(label)}</b><span>${esc(relative)}</span><span>(${esc(minutesAgo(minutes, now))})</span></div>`;
    return `<div class="op-app"><header class="op-header op-header--stack"><button type="button" class="op-back" data-action="back">${icons.back}<span>${esc(COPY.queue)}</span></button><h1 class="op-header__title">${esc(visitor.name)}</h1></header><div class="op-page op-visitor"><div class="op-fields">${visitor.fields.map(fieldRow).join('<span class="op-divider"></span>')}</div><div class="op-stamps">${stamp(COPY.created, "2 hours ago", 122)}${stamp(COPY.approved, "2 hours ago", 118)}${stamp(COPY.registrationStarted, "3 minutes ago", 3)}${stamp(COPY.registrationFinished, "just now", 0)}</div></div><div class="op-bottom"><div class="op-picker-row"><span class="op-picker-row__icon">${icons.liveLoading}</span>${selectHtml()}</div><p class="op-error" role="alert" data-error ${flow.error ? "" : "hidden"}>${esc(flow.error ?? "")}</p><button type="button" class="op-btn op-btn--submit ${working ? "is-working" : ""}" data-action="submit" ${working ? "disabled" : ""}><span class="op-spinner"></span><span>${esc(COPY.callOffDriver)}</span></button></div>${sheetHtml()}</div>`;
  }
  function successPage() {
    return `<div class="op-app"><header class="op-header"><h1></h1></header><div class="op-page op-success"><div class="op-success__mark">${icons.success}</div><h2>${esc(COPY.callOffCompleted)}</h2><button type="button" class="op-btn op-btn--tall" data-action="another"><span>${esc(COPY.callOffAnother)}</span>${icons.chevronRight}</button></div></div>`;
  }
  function render() {
    phone.dataset.screen = flow.screen;
    const pages = {
      home: homePage,
      queue: queuePage,
      visitor: visitorPage,
      success: successPage,
      done: queuePage,
    };
    content.innerHTML = pages[flow.screen]();
    wire();
  }
  function closeSheet(then?: () => void) {
    const sheet = $("[data-scrim]");
    if (!sheet) return;
    sheet.classList.remove("is-open");
    later(() => {
      closeLocations(flow);
      filtersOpen = false;
      render();
      then?.();
    }, 220);
  }
  function refreshList() {
    const list = $("[data-list]");
    if (list) {
      list.innerHTML = listHtml();
      wireOptions();
    }
    const toggle = $("[data-action='toggle-filters']");
    if (toggle)
      toggle.innerHTML = `${icons.sliders}${flow.hideInvalid ? '<i class="op-dot"></i>' : ""}`;
  }
  function wireOptions() {
    for (const b of $$<HTMLButtonElement>("[data-select]"))
      b.onclick = () => {
        const chosen = selectLocation(flow, Number(b.dataset.select));
        for (const o of $$("[data-select]")) {
          const on =
            Number((o as HTMLElement).dataset.select) === flow.selected;
          o.classList.toggle("is-selected", on);
          o.setAttribute("aria-selected", String(on));
        }
        if (chosen) later(() => closeSheet(), SELECT_CLOSE_MS);
      };
  }
  function submit() {
    if (working) return;
    const result = validate(flow);
    if ("error" in result) {
      fail(flow, result.error);
      render();
      return;
    }
    const outcome = opts.onDispatch(result.dock);
    if (outcome !== true) {
      fail(flow, outcome);
      render();
      return;
    }
    working = true;
    render();
    later(() => {
      working = false;
      succeed(flow, result.dock);
      render();
    }, WORKING_MS);
  }
  function wire() {
    for (const b of $$<HTMLButtonElement>("[data-action]"))
      b.onclick = (e) => {
        e.preventDefault();
        switch (b.dataset.action) {
          case "open-app":
            if (openApp(flow)) {
              render();
              $(".op-app")?.classList.add("is-opening");
            }
            break;
          case "open-visitor":
            if (openVisitor(flow)) {
              render();
              $(".op-app")?.classList.add("is-pushing");
            }
            break;
          case "back":
            if (back(flow)) render();
            break;
          case "open-locations":
            if (openLocations(flow)) {
              render();
              const scrim = $("[data-scrim]");
              requestAnimationFrame(() => scrim?.classList.add("is-open"));
            }
            break;
          case "toggle-filters":
            filtersOpen = !filtersOpen;
            $("[data-filters]")?.toggleAttribute("hidden", !filtersOpen);
            b.setAttribute("aria-expanded", String(filtersOpen));
            break;
          case "submit":
            submit();
            break;
          case "another":
            if (another(flow)) {
              render();
              later(() => opts.onClose(), DONE_MS);
            }
            break;
        }
      };
    const scrim = $("[data-scrim]");
    if (scrim)
      scrim.onclick = (e) => {
        if (e.target === scrim) closeSheet();
      };
    const search = $<HTMLInputElement>("[data-search]");
    if (search)
      search.oninput = () => {
        setSearch(flow, search.value);
        refreshList();
      };
    const hide = $<HTMLInputElement>("[data-hide-invalid]");
    if (hide)
      hide.onchange = () => {
        toggleHideInvalid(flow);
        refreshList();
      };
    wireOptions();
    if (!content.contains(document.activeElement))
      phone.focus({ preventScroll: true });
  }
  render();
  requestAnimationFrame(() => phone.classList.add("is-in"));
  later(() => {
    if (notify(flow)) {
      const notice = $(".op-notice");
      if (notice) {
        notice.classList.remove("is-out");
        notice.classList.add("is-in");
      }
      opts.onNotify?.();
    }
  }, NOTIFY_MS);
  const destroy = () => {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    window.removeEventListener("resize", applyMode);
    root.replaceChildren();
  };
  return {
    flow,
    dismiss() {
      if (closing) return Promise.resolve();
      closing = true;
      phone.classList.remove("is-in");
      phone.classList.add("is-away");
      return new Promise((resolve) =>
        setTimeout(() => {
          destroy();
          resolve();
        }, ENTER_MS),
      );
    },
    destroy,
  };
}
