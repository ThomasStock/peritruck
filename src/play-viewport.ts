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
