import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  accumulateWheelZoom,
  clampPanVector,
  clampZoomTarget,
  computeFitDistance,
  createWheelAccumulator,
  positionCamera,
  readCursorZoomPan,
  readFramingZoom,
  readNextZoomLevel,
  readPreviousZoomLevel,
  readSelectionFraming,
  readSteppedZoom,
} from "./camera.js";
import { CAMERA_FOV_DEGREES, SINGLE_CITY_MIN_ZOOM, ZOOM_LEVELS } from "./constants.js";
import { setupContextHandlers, setupPointerHandlers } from "./pointer.js";

// The tiny fixture is 30 by 10 SVG units, 0.03 by 0.01 in world units, 2.4 deep.
const TINY_MAP_SIZE = new THREE.Vector3(0.03, 0.01, 2.4);

test("BAS-04 camera positionCamera positions camera looking at pan target", () => {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, 1, 0.1, 5000);
  camera.up.set(0, 0, 1);
  const orbit = {
    distance: 300,
    tilt: new THREE.Vector2(0, 0),
    pan: new THREE.Vector3(10, 20, 0),
    viewAngleDegrees: 55,
  };

  positionCamera(camera, orbit);

  assert.ok(camera.position.z > 0);
  assert.ok(Math.abs(camera.position.x - 10) < 100);
  assert.ok(Math.abs(camera.position.y - 20) < 300);
});

test("BAS-04 clampPanVector clamps pan vector to map half-extents", () => {
  const mapSize = new THREE.Vector3(200, 100, 10);
  const pan = new THREE.Vector3(150, -80, 0);

  clampPanVector(pan, mapSize);

  assert.equal(pan.x, 100);
  assert.equal(pan.y, -50);
});

test("BAS-04 computeFitDistance finds distance where bounds fit camera viewport", () => {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, 1, 0.1, 5000);
  camera.up.set(0, 0, 1);
  const mapSize = new THREE.Vector3(288, 180, 2);

  const fitDistance = computeFitDistance(camera, mapSize, 55);
  assert.ok(fitDistance > 100 && fitDistance < 1000);
});

test("BAS-04 readFramingZoom computes zoom level for single city and group", () => {
  const singleZoom = readFramingZoom(0.05, 1);
  assert.ok(singleZoom >= 2);
  assert.ok(singleZoom <= 7);

  const groupZoom = readFramingZoom(0.4, 5);
  assert.ok(groupZoom >= 1.02);
  assert.ok(groupZoom <= 7);
});

test("BAS-04 readSelectionFraming reads the share of a world-unit map and centers the pan", () => {
  const firstBounds = new THREE.Box2(new THREE.Vector2(-15, -5), new THREE.Vector2(-5, 5));

  const framing = readSelectionFraming([firstBounds], TINY_MAP_SIZE);

  assert.equal(framing.zoom, SINGLE_CITY_MIN_ZOOM);
  assert.ok(Math.abs(framing.pan.x - -0.01) < 1e-9);
  assert.ok(Math.abs(framing.pan.y) < 1e-9);
});

test("BAS-04 readSelectionFraming keeps the pan inside the map", () => {
  const farBounds = new THREE.Box2(new THREE.Vector2(400, 400), new THREE.Vector2(401, 401));

  const framing = readSelectionFraming([farBounds], TINY_MAP_SIZE);

  assert.ok(Math.abs(framing.pan.x - 0.015) < 1e-9);
  assert.ok(Math.abs(framing.pan.y - -0.005) < 1e-9);
});

test("BAS-04 zoom levels step up and down the ladder and stay in range", () => {
  assert.equal(readNextZoomLevel(1), 1.5);
  assert.equal(readNextZoomLevel(7), 7);
  assert.equal(readPreviousZoomLevel(2.25), 1.5);
  assert.equal(readPreviousZoomLevel(1), 1);
  assert.equal(clampZoomTarget(0.5), 1);
  assert.equal(clampZoomTarget(12), ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
});

test("CAM-04 readSteppedZoom steps in or out based on direction", () => {
  assert.equal(readSteppedZoom(1, 1), 1.5);
  assert.equal(readSteppedZoom(1.5, -1), 1);
  assert.equal(readSteppedZoom(7, 1), 7);
  assert.equal(readSteppedZoom(1, -1), 1);
});

test("CAM-05 accumulateWheelZoom accumulates deltas with 100px threshold", () => {
  const accumulator = createWheelAccumulator();
  assert.equal(accumulator.pixels, 0);

  // 10 events of -5 px = -50 px (does not reach 100 px threshold)
  for (let i = 0; i < 10; i += 1) {
    const direction = accumulateWheelZoom(accumulator, -5);
    assert.equal(direction, 0);
  }
  assert.equal(accumulator.pixels, -50);

  // Another 10 events of -5 px = -100 px (reaches threshold: zooms in, direction 1)
  let triggered = 0;
  for (let i = 0; i < 10; i += 1) {
    const direction = accumulateWheelZoom(accumulator, -5);
    if (direction !== 0) {
      triggered = direction;
    }
  }
  assert.equal(triggered, 1);
  assert.equal(accumulator.pixels, 0);

  // Positive delta = zooms out, direction -1
  assert.equal(accumulateWheelZoom(accumulator, 100), -1);
  assert.equal(accumulator.pixels, 0);
});

test("CAM-04 readCursorZoomPan computes pan keeping ground point fixed under cursor", () => {
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, 1, 0.1, 5000);
  camera.up.set(0, 0, 1);
  const orbit = {
    distance: 300,
    tilt: new THREE.Vector2(0, 0),
    pan: new THREE.Vector3(0, 0, 0),
    viewAngleDegrees: 55,
  };
  const cursorNdc = new THREE.Vector2(0.2, -0.3);
  const groundPoint = new THREE.Vector3(10, -15, 0);

  const pan = readCursorZoomPan({
    camera,
    orbit,
    cursorNdc,
    zoom: 2,
    groundPoint,
  });

  assert.ok(pan !== null);
  assert.ok(typeof pan.x === "number");
  assert.ok(typeof pan.y === "number");
  assert.equal(pan.z, 0);
});

/**
 * @returns {any}
 */
function createFakeCanvas() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  return {
    clientWidth: 200,
    clientHeight: 100,
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 200, height: 100 };
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture() {
      return false;
    },
    /**
     * @param {string} type
     * @param {(ev: any) => void} handler
     */
    addEventListener(type, handler) {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(handler);
    },
    /**
     * @param {string} type
     * @param {(ev: any) => void} handler
     */
    removeEventListener(type, handler) {
      const set = listeners.get(type);
      if (!set) {
        return;
      }
      set.delete(handler);
    },
    /**
     * @param {{ type: string; defaultPrevented?: boolean }} event
     * @returns {boolean}
     */
    dispatchEvent(event) {
      const set = listeners.get(event.type);
      if (!set) {
        return true;
      }
      for (const handler of set) {
        handler(event);
      }
      return !event.defaultPrevented;
    },
  };
}

/**
 * @param {string} type
 * @param {Record<string, any>} props
 * @returns {any}
 */
function createInputEvent(type, props) {
  return {
    type,
    button: 0,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...props,
  };
}

test("CAM-07 a drag past threshold does not trigger click upon release", () => {
  const canvas = createFakeCanvas();
  let clickCount = 0;
  let wheelDelta = 0;

  const cleanup = setupPointerHandlers({
    canvas,
    onPointerMove: () => {},
    onPointerLeave: () => {},
    onClick: () => {
      clickCount += 1;
    },
    onPanStart: () => {},
    onPan: () => {},
    onWheel: (w) => {
      wheelDelta = w.deltaPixels;
    },
    readGroundPoint: () => new THREE.Vector3(0, 0, 0),
    isPannable: () => true,
    isTiltOn: () => false,
    setTiltTarget: () => {},
  });

  // Short movement (3px < 5px threshold) -> click triggers
  canvas.dispatchEvent(createInputEvent("pointerdown", { clientX: 10, clientY: 10, pointerId: 1 }));
  canvas.dispatchEvent(createInputEvent("pointermove", { clientX: 13, clientY: 10, pointerId: 1 }));
  canvas.dispatchEvent(createInputEvent("pointerup", { clientX: 13, clientY: 10, pointerId: 1 }));
  assert.equal(clickCount, 1);

  // Large movement (20px >= 5px threshold) -> drag marked, click suppressed
  canvas.dispatchEvent(createInputEvent("pointerdown", { clientX: 10, clientY: 10, pointerId: 1 }));
  canvas.dispatchEvent(createInputEvent("pointermove", { clientX: 30, clientY: 10, pointerId: 1 }));
  canvas.dispatchEvent(createInputEvent("pointerup", { clientX: 30, clientY: 10, pointerId: 1 }));
  assert.equal(clickCount, 1);

  // Wheel event prevents default and calls onWheel
  const wheelEv = createInputEvent("wheel", {
    deltaY: -100,
    deltaMode: 0,
    clientX: 50,
    clientY: 50,
  });
  canvas.dispatchEvent(wheelEv);
  assert.equal(wheelEv.defaultPrevented, true);
  assert.equal(wheelDelta, -100);

  cleanup();
});

test("ERR-03 a lost WebGL context is kept restorable and its return is reported", () => {
  const canvas = createFakeCanvas();
  const calls = { lost: 0, restored: 0 };
  const cleanup = setupContextHandlers({
    canvas,
    onLost: () => {
      calls.lost += 1;
    },
    onRestored: () => {
      calls.restored += 1;
    },
  });

  const lostEvent = createInputEvent("webglcontextlost", {});
  canvas.dispatchEvent(lostEvent);
  canvas.dispatchEvent(createInputEvent("webglcontextrestored", {}));
  cleanup();
  canvas.dispatchEvent(createInputEvent("webglcontextlost", {}));

  assert.equal(lostEvent.defaultPrevented, true);
  assert.deepEqual(calls, { lost: 1, restored: 1 });
});
