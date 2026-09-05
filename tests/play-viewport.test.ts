import test from "node:test";
import assert from "node:assert/strict";
import {
  browserChromeOpen,
  nativeFullscreenAvailable,
  requestNativeFullscreen,
} from "../src/play-viewport";

test("browser chrome is open when the visual viewport is shorter than the layout viewport", () => {
  assert.equal(
    browserChromeOpen(800, {
      height: 620,
      offsetTop: 0,
      offsetLeft: 0,
      width: 390,
    }),
    true,
  );
});

test("browser chrome is open when Safari offsets the visual viewport below the status bar", () => {
  assert.equal(
    browserChromeOpen(800, {
      height: 800,
      offsetTop: 54,
      offsetLeft: 0,
      width: 390,
    }),
    true,
  );
});

test("browser chrome is collapsed when the visual viewport fills the layout viewport", () => {
  assert.equal(
    browserChromeOpen(800, {
      height: 800,
      offsetTop: 0,
      offsetLeft: 0,
      width: 390,
    }),
    false,
  );
});

test("iPhone-like roots have no native fullscreen method", () => {
  assert.equal(nativeFullscreenAvailable({}), false);
});

test("Android-like roots expose requestFullscreen", () => {
  assert.equal(
    nativeFullscreenAvailable({ requestFullscreen: () => Promise.resolve() }),
    true,
  );
});

test("requestNativeFullscreen no-ops when the API is missing", () => {
  assert.equal(requestNativeFullscreen({}), undefined);
});
