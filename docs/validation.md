# V2 validation

- TypeScript static checking and Vite production compilation.
- 6 kiosk flow tests: both check-in methods, prefix handling and no-match feedback, step ordering guards, demo phone validation and formatting, and completeness of all six language tables.
- Kiosk replica inspected in the browser at 1440×900 (physical kiosk with rails and the paperwork beside the device) and 375×812 (Mobile Driver Portal with inline top bar and the paperwork peeking from the bottom edge: View/Hide, swipe up and down, Escape, hidden behind the Help sheet): language, method, visit type, reference (wrong and right value), country picker, phone confirmation, endscreen.
- 15 tests covering a complete no-contact delivery, deterministic replay, auto braking/reversing, precision speed, assisted trailer steering and stabilization, full-rig parking, rear-first dock acceptance and hold time, tractor/trailer gate collision, flanking fences, collision rollback, oriented-rectangle crossings, progression guards and invalid credentials, safe recovery, invalid command validation, modal pause.
- Full headless CLI demo: 313.357 m driven, 139.7 s simulated, no contacts or recoveries, 0.153° trailer heading error, 0.445 m bumper gap. Uses the same physics; no pose/phase shortcuts.
- Live browser CLI parking observed: truck stopped entirely inside P02 and the normal “Park & step out” prompt appeared.
- Browser visual inspection: first-screen yard, follow camera, truck, kiosk/office, holding bay, minimap, speed HUD and contextual prompt. Asphalt/apron depth separation and trailer-side text orientation fixed following inspection.
- WebMCP tools `yard_status` and `yard_control` registered with expected schemas. Execution checks were blocked by automatic browser approval review reporting a usage limit. No execution verification claimed.
- Physical gamepad hardware not available for validation. Standard mapping support is implemented.

The long arrival loop in the demo is deliberate: it squares the complete trailer with the gate, avoiding a sharp last-second turn from the holding bays. The visual route uses the same waypoint corridor.
