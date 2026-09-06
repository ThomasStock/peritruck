/** A captured pointer keeps walking responsive even outside the joystick rim. */
export function walkingJoystick(element: HTMLElement) {
  const knob = element.querySelector<HTMLElement>(".joystick-knob")!;
  const value = { x: 0, z: 0 };
  let pointer: number | null = null;

  function reset() {
    const previous = pointer;
    pointer = null;
    value.x = value.z = 0;
    knob.style.transform = "translate(0px, 0px)";
    element.classList.remove("pressed");
    if (previous !== null && element.hasPointerCapture(previous))
      element.releasePointerCapture(previous);
  }

  function move(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    const rect = element.getBoundingClientRect();
    const radius = (rect.width - knob.offsetWidth) / 2;
    if (radius <= 0) return;
    const x = (event.clientX - rect.left - rect.width / 2) / radius;
    const z = (event.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(x, z);
    const limit = Math.max(1, length);
    knob.style.transform = `translate(${(x / limit) * radius}px, ${(z / limit) * radius}px)`;
    // A small dead zone prevents drift; the remaining travel controls speed.
    const strength = Math.max(0, Math.min(1, (length - 0.12) / 0.88));
    value.x = length ? (x / length) * strength : 0;
    value.z = length ? (z / length) * strength : 0;
  }

  element.onpointerdown = (event) => {
    if (pointer !== null || element.hidden || event.button !== 0) return;
    event.preventDefault();
    pointer = event.pointerId;
    element.setPointerCapture(pointer);
    element.classList.add("pressed");
    move(event);
  };
  element.onpointermove = move;
  const release = (event: PointerEvent) => {
    if (event.pointerId === pointer) reset();
  };
  element.onpointerup = release;
  element.onpointercancel = release;
  element.onlostpointercapture = release;
  return { value, reset };
}
