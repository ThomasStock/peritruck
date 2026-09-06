/** The yard operator's call-off, mirroring the Peripass Yard Operator App's
 * dispatch module: a push notification on the lock screen, the call-off queue,
 * the visitor's details with a yard-location picker, and the confirmation.
 * Pure data, no DOM, so the browser view and tests share one contract.
 */
import {
  DOCKS,
  type DockStatus,
  dockLabel,
  dockStatus,
} from "../game/simulation";
export type Screen = "home" | "queue" | "visitor" | "success" | "done";
/** A yard location as the app lists it; docks carry the parked trailer as asset. */
export type Location = {
  id: number;
  name: string;
  status: DockStatus;
  asset?: { name: string; status: "ToUnload" | "FinishedFull" };
};
export const LOCATIONS: Location[] = DOCKS.map((d) => ({
  id: d.number,
  name: `Dock ${dockLabel(d.number)}`,
  status: dockStatus(d.number),
  ...(d.number === 5
    ? { asset: { name: "1-KLM-482", status: "ToUnload" } }
    : {}),
}));
/** Reason tag shown next to a location that cannot take the visitor. */
export type InvalidReason = "Occupied" | "OutOfService";
export const invalidReason = (l: Location): InvalidReason | null =>
  l.status === "occupied"
    ? "Occupied"
    : l.status === "outOfService"
      ? "OutOfService"
      : null;
/** Copy of the production app's dispatch strings that the replica shows. */
export const COPY = {
  callOffDrivers: "Call-off drivers",
  waitingDispatch: "Waiting dispatch",
  approvedSince: (relative: string) => `Approved ${relative}`,
  queue: "Queue",
  selectYardLocation: "Select yard location",
  callOffDriver: "Call off driver",
  hideInvalidLocations: "Hide invalid locations",
  searchOption: "Search option",
  noResults: "No results found.",
  nothingFoundFor: "Nothing found for",
  filtersApplied: "Note: Additional filters are applied",
  occupied: "Occupied",
  outOfService: "Out of service",
  required: "Required",
  locationOccupied: "Location is already occupied.",
  locationOutOfService: "Location is out of service.",
  callOffCompleted: "Call-off completed",
  callOffAnother: "Call off another driver",
  allDone: "You're all done!",
  nobodyToCallOff: "Nobody to call off.",
  refresh: "Refresh",
  tasks: "Tasks",
  callOff: "Call-off",
  settings: "Settings",
  created: "Created",
  approved: "Approved",
  registrationStarted: "Registration started",
  registrationFinished: "Registration finished",
  appName: "Peripass Yard",
  notificationTitle: "Driver waiting for call-off",
  notificationBody: (name: string) =>
    `${name} checked in at the kiosk and is waiting in holding bay P02. Assign a dock.`,
} as const;
export type Field = {
  label: string;
  value: string;
  kind?: "text" | "plate" | "phone";
};
export type Visitor = {
  id: number;
  name: string;
  loadingType: "LiveLoading";
  fields: Field[];
};
/** The driver who just checked in, as the queue lists them. Details come from
 * the delivery note that lies next to the kiosk. */
export function visitorFor(booking: string): Visitor {
  return {
    id: 4171,
    name: `Yard Shift Transport · ${booking}`,
    loadingType: "LiveLoading",
    fields: [
      { label: "Carrier", value: "Yard Shift Transport bv" },
      { label: "Licence plate", value: "1-YRD-048", kind: "plate" },
      { label: "Reference", value: booking },
      { label: "Visit type", value: "Inbound delivery" },
      { label: "Goods", value: "General cargo · 12 pallets" },
      { label: "Time slot", value: "09:30 – 10:00" },
      { label: "Phone", value: "+32 470 12 34 56", kind: "phone" },
    ],
  };
}
export type Flow = {
  screen: Screen;
  /** The push notification has dropped onto the lock screen. */
  notified: boolean;
  /** Chosen yard location (dock number), if any. */
  selected?: number;
  /** The location picker sheet is up. */
  sheetOpen: boolean;
  search: string;
  hideInvalid: boolean;
  /** Validation or server message under the picker. */
  error?: string;
  /** The dock the visitor was called off to. */
  dispatched?: number;
};
export function createFlow(): Flow {
  return {
    screen: "home",
    notified: false,
    sheetOpen: false,
    search: "",
    hideInvalid: false,
  };
}
/** The notification lands; only once, and only while the phone is locked. */
export function notify(f: Flow): boolean {
  if (f.screen !== "home" || f.notified) return false;
  f.notified = true;
  return true;
}
/** Tap the notification or the app icon: the call-off queue opens. */
export function openApp(f: Flow): boolean {
  if (f.screen !== "home") return false;
  f.screen = "queue";
  return true;
}
export function openVisitor(f: Flow): boolean {
  if (f.screen !== "queue" || f.dispatched !== undefined) return false;
  f.screen = "visitor";
  return true;
}
/** The header's back button: from the details to the queue. */
export function back(f: Flow): boolean {
  if (f.screen !== "visitor") return false;
  f.screen = "queue";
  f.sheetOpen = false;
  f.search = "";
  return true;
}
export function openLocations(f: Flow): boolean {
  if (f.screen !== "visitor" || f.sheetOpen) return false;
  f.sheetOpen = true;
  f.search = "";
  return true;
}
export function closeLocations(f: Flow): boolean {
  if (!f.sheetOpen) return false;
  f.sheetOpen = false;
  return true;
}
export function setSearch(f: Flow, search: string) {
  f.search = search;
}
export function toggleHideInvalid(f: Flow) {
  f.hideInvalid = !f.hideInvalid;
}
/** Picking the selected location again clears it, as in the app. Returns
 * whether a location is selected afterwards, so the caller can close the sheet. */
export function selectLocation(f: Flow, id: number): boolean {
  if (!f.sheetOpen || !LOCATIONS.some((l) => l.id === id)) return false;
  f.selected = f.selected === id ? undefined : id;
  f.error = undefined;
  return f.selected !== undefined;
}
export function visibleLocations(f: Flow): Location[] {
  const q = f.search.trim().toLowerCase();
  return LOCATIONS.filter(
    (l) =>
      (!f.hideInvalid || !invalidReason(l)) &&
      (!q || l.name.toLowerCase().includes(q) || String(l.id).includes(q)),
  );
}
/** Validate the form like the app does (a location is required) and like the
 * server does (it must be free). Returns the dock to call the visitor off to. */
export function validate(f: Flow): { dock: number } | { error: string } {
  if (f.screen !== "visitor") return { error: "Open the driver first." };
  const location = LOCATIONS.find((l) => l.id === f.selected);
  if (!location) return { error: COPY.required };
  const reason = invalidReason(location);
  if (reason === "Occupied") return { error: COPY.locationOccupied };
  if (reason === "OutOfService") return { error: COPY.locationOutOfService };
  return { dock: location.id };
}
/** Show a validation or server message under the picker. */
export function fail(f: Flow, error: string) {
  f.error = error;
}
/** The call-off went through. */
export function succeed(f: Flow, dock: number): boolean {
  if (f.screen !== "visitor") return false;
  f.dispatched = dock;
  f.error = undefined;
  f.sheetOpen = false;
  f.screen = "success";
  return true;
}
/** "Call off another driver": back to a queue with nobody left in it. */
export function another(f: Flow): boolean {
  if (f.screen !== "success") return false;
  f.screen = "done";
  return true;
}
