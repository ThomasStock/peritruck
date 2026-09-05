# Peritruck v2: yard, Peripass, controls research

Research date: 2026-09-05. Primary sources below; numerical game tuning and artistic choices are explicitly recommendations, not industry specifications. No repository changes made.

## Core conclusion

Keep the requested arrival → holding bay → kiosk → PIN barrier → assigned dock loop. It corresponds directly to a real Belgian Peripass installation. Build a small, legible yard around a forgiving articulated truck, with assisted reversing as the default and raw steering as an optional challenge.

## Peripass workflow: verified facts

- **Real site precedent:** Cebeo’s Blandain delivery instructions require drivers to park in the provided holding area, register at a Peripass kiosk using their delivery reference, choose a language and provide a mobile number, then receive instructions by SMS and use the supplied PIN at the barrier. This closely matches the proposed game. [Cebeo delivery conditions, page 4](https://www.cebeo.be/caas/v1/media/116659512/data/834728212deff8275b9f7b887b576dbd)
- **Registration is configurable:** Peripass offers mobile, indoor kiosk and outdoor kiosk check-in; questions depend on visit purpose. Registration records information and sends next-step instructions in the driver’s language. [Peripass self-service registration](https://peripass.com/feature/self-service-registration/)
- **Access control is a real product:** PIN-Point validates access codes through cloud technology and triggers barriers, speedgates or turnstiles. Personal codes and access events support knowing who is in each site zone. [Peripass access integration](https://peripass.com/feature/access-control-system-integration/)
- **Yard management extends beyond entry:** the digital twin represents parking spots and loading docks, with an arrival queue and dispatch rules. The gameplay should communicate “you are assigned to Dock 03,” rather than suggesting drivers choose any dock. [Peripass dispatch dashboard](https://peripass.com/feature/digital-twin-and-dispatch-dashboard/)
- **Communication is an essential part of the process:** multilingual messages tell drivers their next steps after check-in. A persistent simulated dispatch message is a faithful game mechanism. [Peripass driver communication](https://peripass.com/feature/driver-communication/)

**Recommended scenario:** fictional delivery PP-2048, fixed tutorial PIN, three holding bays outside the controlled perimeter, sheltered kiosk reachable by protected footpath, PIN terminal at cab height before a stop line, four numbered docks inside. Simplify kiosk to language/purpose/reference review + one confirmation. Show PIN persistently in a dispatch card; never make remembering it the challenge. Short entry/exit animation or optional walk-to-kiosk can preserve driver involvement without a separate fiddly locomotion game.

## Yard realism: verified facts and implementation choices

HSE recommends one-way systems where possible, separation of vehicle and pedestrian routes, appropriate crossings and signs, firm even surfaces, and reducing reversing. Delivery drivers need special consideration because they may be unfamiliar with the site. [HSE workplace transport introduction](https://www.hse.gov.uk/workplacetransport/about.htm)

Holding areas should be clearly signed, firm, level and well lit; drivers leaving parked vehicles should not have to cross hazardous working areas. Drive-through parking avoids reversing, while angled reverse parking can simplify departure. [HSE parking guidance](https://www.hse.gov.uk/workplacetransport/factsheets/parking.htm), [HSE HSG136, parking](https://www.hse.gov.uk/pubns/priced/hsg136.pdf)

Loading areas should be level and separated from unrelated vehicles and pedestrians; brakes should secure the truck before loading. This supports ending the task only once aligned, stopped and parked. [HSE loading guidance](https://www.hse.gov.uk/workplacetransport/information/loading.htm)

**Scale reference, not an exhaustive statement of current permitted combinations:** a European Commission implementation report describes standard articulated combinations around 16.5 m length, 2.55–2.60 m width and 4 m height, with a swept-circle envelope of 12.5 m outer/5.3 m inner radius. Those circle dimensions are a whole-vehicle manoeuvrability envelope, not a single bicycle-model turning radius. [European Commission report](https://transport.ec.europa.eu/document/download/45e1073e-373a-4156-966b-0523915dec9f_en?filename=SWD_2023_70_implementation_report_amendments_dir_96_53.pdf)

**Recommended game blockout (invented tuning dimensions):** roughly 100 × 100 m usable play area; 16 m articulated vehicle, 2.55 m wide; 20 × 4.5 m holding bays; 6–7 m entry/circulation lane; 6 m open gate; 35–40 m clear apron in front of docks; dock spacing 5–6 m. Widen tutorial manoeuvres based on actual swept-path playtests, not aesthetics. These are forgiving prototype choices, not building-design rules.

**Readable layout:** start on a broad approach road; holding bays visible immediately; kiosk beside the bays; gate further forward; beyond it a loop into an open apron; warehouse on one edge. Give the player a straightforward forward approach and a final reversing challenge. Keep a full trailer length of recovery space. Prevent passing around the barrier through continuous perimeter geometry, and test that closed-gate collision uses both tractor and trailer.

**Useful 3D details:** grey ribbed warehouse cladding, black dock shelters, raised dock openings, rubber bumpers, small red/green dock lamps, large bay numbers, wheel guides, striped barrier arm, fence, guard booth, bollards, walkways, asphalt joins, drains, planted verge, stacked pallets in a separated service area. Manufacturers use physical/optical guides to help drivers center trucks; ASSA ABLOY offers a white alignment light and a red stop signal. [ASSA ABLOY Dock-IN](https://www.assaabloyentrance.com/global/en/solutions/products/loading-dock-equipment/accessories/assa-abloy-de6090di-dock-in-and-traffic-lights), [Hörmann loading technology brochure, manoeuvring guides](https://www.hoermann.com/fileadmin/_country/kataloge/pdf/86278_Verladetechnik_EN.pdf)

## Peripass house style: observed first-party assets

Verified directly from the production website’s CSS (not a formal brand manual):

| Token              | Value                  |
| ------------------ | ---------------------- |
| Primary brand teal | `#00A990`              |
| Pale green surface | `#E0EBE9`              |
| Neutral grey       | `#B0B1B1`              |
| Light grey         | `#E1E1E1` / `#F7F7F7`  |
| Core text/surface  | black / white          |
| Body and headings  | Montserrat, sans-serif |

[Peripass global CSS](https://peripass.com/wp-content/uploads/breakdance/css/global-settings.css), [official green SVG logo](https://peripass.com/wp-content/uploads/2024/05/peripass-logo-groen.svg), [homepage](https://peripass.com/).

**Recommended adaptation:** teal cab, kiosk panel, warehouse fascia and route accents; creamy/grey concrete, asphalt, restrained greenery; dark teal interface text on white cards. Keep yellow/orange for physical safety markings and selected interaction accents. Do not cover the whole ground in brand teal. Use dark text on bright teal when small text would otherwise lack contrast. Stylized bevelled models, soft directional shadows and warm daylight make the yard inviting without hiding collision edges.

## Truck UX: sourced principles

1. **Direct trailer intent has a real precedent.** Ford describes reversing difficulty as the need to steer opposite the desired trailer direction and the risk of jackknifing. Pro Trailer Backup Assist lets drivers specify trailer direction while the vehicle handles steering and may limit speed. This is pickup-trailer technology, used here as an interaction analogy rather than a claim about heavy truck equipment. [Ford first-party explanation](https://media.ford.com/content/fordmedia/fna/ca/en/news/2015/05/21/all-new-pro-trailer-backup-assist-for-2016-ford-f-150.html)
2. **Support player choice and simpler input.** Xbox guidelines recommend full keyboard access, input remapping and alternatives to demanding simultaneous/repetitive/long-held inputs. [XAG 107](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/107)
3. **Difficulty is multidimensional.** Expose assists individually instead of making a single difficulty switch change everything. [XAG 108](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/108)
4. **Critical cues need redundancy.** Pair color with text/shape and useful sounds; make HUD cues strongly visible. [XAG 103](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/103), [XAG 102](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/102)
5. **Forgiveness is an established accessibility option.** Microsoft explicitly mentions simplified input and rewind/replay as options. [Microsoft game accessibility](https://learn.microsoft.com/en-us/windows/uwp/gaming/accessibility-for-games)

## Recommended control and feedback specification

These are design hypotheses to tune by playing the game; not sourced claims about universal “best” controls.

- **Default Assisted:** W/Up forward, S/Down brake then reverse after stopping, A/D or arrows steer; Space brake; E interact; C camera; R recover to last safe checkpoint. Automatic gearbox, speed-sensitive steering smoothing, clear D/R indicator. A release-and-repress at zero prevents an accidental immediate reverse when braking; make the selected behavior explicit in help.
- **Reverse assist:** while reversing, left/right commands the desired trailer turn; a bounded feedback controller counter-steers the tractor. Neutral input aims to straighten/hold trailer heading. Cap reverse around 5–6 km/h; forward around 18–22 km/h, with a precision toggle around 3–4 km/h. Never hard-clamp articulation independently of positions: it can produce impossible trailer motion.
- **Optional Classic:** steer the tractor wheels identically forward and reverse, retaining true articulation. Clear mode label and concise lesson: small inputs; watch trailer; pull forward to straighten. Do not silently change control semantics midway through a session.
- **Camera:** elevated follow view showing whole rig and target, with fixed-orientation overview toggle. Follow the rig’s midpoint, widen at tight articulation, ease transitions. Avoid flipping the camera 180° immediately on reverse. A stationary overview is useful for parking and motion sensitivity.
- **Prediction:** draw a short dotted trailer-rear path and wheel-track/swept-width guides using the same simulation as real movement. In reverse show trailer direction rather than only tractor nose. Limit this to nearby ground; no giant glowing road hiding the scenery.
- **Dock assistance:** show remaining distance, lateral offset and angle with small arrows (“0.6 m left”, “straighten 4°”), an outlined target footprint, and progressively faster proximity pulses. Stopped + rear near dock + heading tolerance + correct assignment triggers success. First mission tolerance can be generous: approximately ±0.7 m, ±8°, <0.2 m/s held briefly. Do not finish merely when the tractor enters the dock rectangle.
- **Learning:** give one contextual instruction at a time. First forward curve before holding bay; obvious stopped parking confirmation; very short kiosk interaction; obvious gate stop line; final guided reverse. Route objective, next instruction and interaction prompt should agree at all times.
- **Feel:** mild acceleration easing and braking response; visible front-wheel steering and trailer articulation; restrained engine sound tied to effort, reverse beep, indicator/gate click and dock-confirmation chime. Collisions brake/slide gently with brief feedback; one-touch recover; no harsh fail/restart for a beginner.
- **Scoring:** completion first, then optional precision/smoothness badges. Timer can be visible but untimed completion must work. Avoid encouraging dangerous speed through the site or punishing a useful pull-forward correction.

## CLI and verification recommendations

Keep a pure deterministic fixed-step simulation shared by browser and CLI. Commands should include reset/seed, state, step(inputs, ticks), interact, set mode/camera, screenshot and replay. Return world position, tractor/trailer heading, articulation, speed, steering, stage, active objective, PIN availability, dock alignment, collisions and last events as JSON. Browser and CLI must call the same state machine; do not implement a separate CLI “win” shortcut.

Retain a documented autonomous demonstration script plus recorded input replay to make regressions reproducible. A planner may drive the same input interface, but distinguish raw input playback from convenience navigation. Validate assisted and classic reversal separately.

Minimum acceptance runs: keyboard-only entire flow; CLI entire flow without teleporting through stages; invalid PIN remains closed; barrier cannot be bypassed; reverse into correct dock versus wrong dock; trailer collision at corner; recovery while badly articulated; blur/tab switch releases stuck controls; 30/60/120 Hz produce equivalent final state; reduced-motion/overview stays usable; small-screen controls do not cover truck or target. Measure first successful completion, time stuck reversing, number of recoveries and whether players understand which part of the vehicle A/D controls. These metrics decide tuning more credibly than visual polish alone.
