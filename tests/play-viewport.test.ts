import test from "node:test";
import assert from "node:assert/strict";
import { requestNativeFullscreen } from "../src/play-viewport";

test("requestNativeFullscreen no-ops when the API is missing", () => {
  assert.equal(requestNativeFullscreen({}), undefined);
});

test("requestNativeFullscreen uses the standard Fullscreen API when present", async () => {
  const calls: unknown[] = [];
  await requestNativeFullscreen({
    requestFullscreen: (options: unknown) => {
      calls.push(options);
      return Promise.resolve();
    },
  });
  assert.deepEqual(calls, [{ navigationUI: "hide" }]);
});
