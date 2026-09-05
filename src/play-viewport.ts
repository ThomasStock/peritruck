/** iPhone Safari has no element Fullscreen API. Hide chrome by scrolling instead. */

export type VisualBox = {
  height: number;
  offsetTop: number;
  offsetLeft: number;
  width: number;
};

export function browserChromeOpen(
  innerHeight: number,
  box: VisualBox,
): boolean {
  return innerHeight - box.height > 40 || box.offsetTop > 20;
}

export function nativeFullscreenAvailable(root: object): boolean {
  return (
    typeof Reflect.get(root, "requestFullscreen") === "function" ||
    typeof Reflect.get(root, "webkitRequestFullscreen") === "function"
  );
}

export function requestNativeFullscreen(
  root: object,
): Promise<void> | undefined {
  const request = Reflect.get(root, "requestFullscreen");
  if (typeof request === "function") {
    return Promise.resolve(request.call(root, { navigationUI: "hide" })).then(
      () => undefined,
    );
  }
  const prefixed = Reflect.get(root, "webkitRequestFullscreen");
  if (typeof prefixed === "function") prefixed.call(root);
  return undefined;
}
