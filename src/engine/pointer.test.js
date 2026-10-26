import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { setupPointerHandlers } from "./pointer.js";

const PRIMARY_BUTTON = 0;
const MIDDLE_BUTTON = 1;
const SECONDARY_BUTTON = 2;
const FIRST_POINTER = 1;
const SECOND_POINTER = 2;
const PRESS_X = 10;
const PRESS_Y = 10;
const SHORT_MOVE_X = 13;
const DRAG_MOVE_X = 30;
const FAR_DRAG_MOVE_X = 40;

test("SEL-01 a secondary button press and release without a drag does not click", () => {
  const probe = mountPointerProbe();

  pressAndRelease(probe.canvas, { button: SECONDARY_BUTTON });
  probe.cleanup();

  assert.equal(probe.clickCount, 0);
});

test("SEL-01 a middle button press and release without a drag does not click", () => {
  const probe = mountPointerProbe();

  pressAndRelease(probe.canvas, { button: MIDDLE_BUTTON });
  probe.cleanup();

  assert.equal(probe.clickCount, 0);
});

test("SEL-01 a secondary button press after a primary click does not add a second click", () => {
  const probe = mountPointerProbe();

  pressAndRelease(probe.canvas, { button: PRIMARY_BUTTON });
  pressAndRelease(probe.canvas, { button: SECONDARY_BUTTON });
  pressAndRelease(probe.canvas, { button: MIDDLE_BUTTON });
  probe.cleanup();

  assert.equal(probe.clickCount, 1);
});

test("SEL-01 the primary button keeps the click and a drag past the threshold keeps no click", () => {
  const probe = mountPointerProbe();

  dispatchPointer(probe.canvas, "pointerdown", { button: PRIMARY_BUTTON });
  dispatchPointer(probe.canvas, "pointermove", { clientX: SHORT_MOVE_X });
  dispatchPointer(probe.canvas, "pointerup", { clientX: SHORT_MOVE_X, button: PRIMARY_BUTTON });
  assert.equal(probe.clickCount, 1);

  dispatchPointer(probe.canvas, "pointerdown", { button: PRIMARY_BUTTON });
  dispatchPointer(probe.canvas, "pointermove", { clientX: DRAG_MOVE_X });
  dispatchPointer(probe.canvas, "pointerup", { clientX: DRAG_MOVE_X, button: PRIMARY_BUTTON });
  probe.cleanup();

  assert.equal(probe.clickCount, 1);
});

test("SEL-01 the release of another pointer does not close the interaction", () => {
  const probe = mountPointerProbe();

  dispatchPointer(probe.canvas, "pointerdown", { pointerId: FIRST_POINTER });
  dispatchPointer(probe.canvas, "pointerup", { pointerId: SECOND_POINTER });
  assert.equal(probe.clickCount, 0);

  dispatchPointer(probe.canvas, "pointerup", { pointerId: FIRST_POINTER });
  probe.cleanup();

  assert.equal(probe.clickCount, 1);
});

test("SEL-01 the release of another pointer during a drag does not stop the drag", () => {
  const probe = mountPointerProbe();

  dispatchPointer(probe.canvas, "pointerdown", { pointerId: FIRST_POINTER });
  dispatchPointer(probe.canvas, "pointermove", { pointerId: FIRST_POINTER, clientX: DRAG_MOVE_X });
  dispatchPointer(probe.canvas, "pointerup", { pointerId: SECOND_POINTER, clientX: DRAG_MOVE_X });
  dispatchPointer(probe.canvas, "pointermove", {
    pointerId: FIRST_POINTER,
    clientX: FAR_DRAG_MOVE_X,
  });
  dispatchPointer(probe.canvas, "pointerup", {
    pointerId: FIRST_POINTER,
    clientX: FAR_DRAG_MOVE_X,
  });
  probe.cleanup();

  assert.equal(probe.panCount, 1);
  assert.equal(probe.clickCount, 0);
});

test("CAM-07 a primary button drag past the threshold still pans the map", () => {
  const probe = mountPointerProbe();

  dispatchPointer(probe.canvas, "pointerdown", { button: PRIMARY_BUTTON });
  dispatchPointer(probe.canvas, "pointermove", { clientX: DRAG_MOVE_X });
  dispatchPointer(probe.canvas, "pointermove", { clientX: FAR_DRAG_MOVE_X });
  dispatchPointer(probe.canvas, "pointerup", { clientX: FAR_DRAG_MOVE_X, button: PRIMARY_BUTTON });
  probe.cleanup();

  assert.equal(probe.panStartCount, 1);
  assert.equal(probe.panCount, 1);
  assert.equal(probe.clickCount, 0);
});

test("CAM-07 a secondary or middle button drag pans the map without clicking", () => {
  const probe = mountPointerProbe();

  dispatchPointer(probe.canvas, "pointerdown", { button: SECONDARY_BUTTON });
  dispatchPointer(probe.canvas, "pointermove", { clientX: DRAG_MOVE_X, button: SECONDARY_BUTTON });
  dispatchPointer(probe.canvas, "pointermove", {
    clientX: FAR_DRAG_MOVE_X,
    button: SECONDARY_BUTTON,
  });
  dispatchPointer(probe.canvas, "pointerup", {
    clientX: FAR_DRAG_MOVE_X,
    button: SECONDARY_BUTTON,
  });

  dispatchPointer(probe.canvas, "pointerdown", { button: MIDDLE_BUTTON });
  dispatchPointer(probe.canvas, "pointermove", { clientX: DRAG_MOVE_X, button: MIDDLE_BUTTON });
  dispatchPointer(probe.canvas, "pointermove", {
    clientX: FAR_DRAG_MOVE_X,
    button: MIDDLE_BUTTON,
  });
  dispatchPointer(probe.canvas, "pointerup", { clientX: FAR_DRAG_MOVE_X, button: MIDDLE_BUTTON });

  let contextMenuPrevented = false;
  probe.canvas.dispatchEvent({
    type: "contextmenu",
    preventDefault() {
      contextMenuPrevented = true;
    },
  });
  probe.cleanup();

  assert.equal(probe.panStartCount, 2);
  assert.equal(probe.panCount, 2);
  assert.equal(probe.clickCount, 0);
  assert.equal(contextMenuPrevented, true);
});

test("MOB-05 sets touch-action none on the canvas", () => {
  const probe = mountPointerProbe();
  probe.cleanup();

  assert.equal(probe.canvas.style.touchAction, "none");
});

test("MOB-05 a single-finger touch drag past the 10px threshold pans the map without clicking", () => {
  const probe = mountPointerProbe();

  dispatchPointer(probe.canvas, "pointerdown", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: PRESS_X,
    clientY: PRESS_Y,
  });
  dispatchPointer(probe.canvas, "pointermove", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: DRAG_MOVE_X,
    clientY: PRESS_Y,
  });
  dispatchPointer(probe.canvas, "pointermove", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: FAR_DRAG_MOVE_X,
    clientY: PRESS_Y,
  });
  dispatchPointer(probe.canvas, "pointerup", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: FAR_DRAG_MOVE_X,
    clientY: PRESS_Y,
  });
  probe.cleanup();

  assert.equal(probe.panStartCount, 1);
  assert.equal(probe.panCount, 2);
  assert.equal(probe.clickCount, 0);
  assert.equal(probe.inspectCount, 0);
});

test("MOB-05 a two-finger touch pinch zooms the map and does not pan or click", () => {
  const probe = mountPointerProbe();

  dispatchPointer(probe.canvas, "pointerdown", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: 50,
    clientY: 50,
  });
  dispatchPointer(probe.canvas, "pointerdown", {
    pointerId: SECOND_POINTER,
    pointerType: "touch",
    clientX: 150,
    clientY: 50,
  });
  dispatchPointer(probe.canvas, "pointermove", {
    pointerId: SECOND_POINTER,
    pointerType: "touch",
    clientX: 270,
    clientY: 50,
  });
  dispatchPointer(probe.canvas, "pointerup", {
    pointerId: SECOND_POINTER,
    pointerType: "touch",
    clientX: 270,
    clientY: 50,
  });
  dispatchPointer(probe.canvas, "pointerup", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: 50,
    clientY: 50,
  });
  probe.cleanup();

  assert.equal(probe.wheelEvents.length, 1);
  assert.equal(probe.wheelEvents[0].deltaPixels, -120);
  assert.equal(probe.wheelEvents[0].x, 160);
  assert.equal(probe.wheelEvents[0].y, 50);
  assert.equal(probe.panCount, 0);
  assert.equal(probe.clickCount, 0);
  assert.equal(probe.inspectCount, 0);
});

test("MOB-05 the second finger does not overwrite the first pointer drag or jump pan", () => {
  const probe = mountPointerProbe();

  dispatchPointer(probe.canvas, "pointerdown", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: PRESS_X,
    clientY: PRESS_Y,
  });
  dispatchPointer(probe.canvas, "pointermove", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: DRAG_MOVE_X,
    clientY: PRESS_Y,
  });
  dispatchPointer(probe.canvas, "pointerdown", {
    pointerId: SECOND_POINTER,
    pointerType: "touch",
    clientX: 120,
    clientY: 80,
  });
  dispatchPointer(probe.canvas, "pointerup", {
    pointerId: SECOND_POINTER,
    pointerType: "touch",
    clientX: 120,
    clientY: 80,
  });
  dispatchPointer(probe.canvas, "pointermove", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: FAR_DRAG_MOVE_X,
    clientY: PRESS_Y,
  });
  dispatchPointer(probe.canvas, "pointerup", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: FAR_DRAG_MOVE_X,
    clientY: PRESS_Y,
  });
  probe.cleanup();

  assert.equal(probe.panStartCount, 1);
  assert.equal(probe.panCount, 2);
  assert.equal(probe.clickCount, 0);
  assert.equal(probe.inspectCount, 0);
});

test("MOB-05 pointercancel clears the active gesture without clicking or inspecting", () => {
  const probe = mountPointerProbe();

  dispatchPointer(probe.canvas, "pointerdown", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: PRESS_X,
    clientY: PRESS_Y,
  });
  dispatchPointer(probe.canvas, "pointercancel", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: PRESS_X,
    clientY: PRESS_Y,
  });
  dispatchPointer(probe.canvas, "pointerup", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: PRESS_X,
    clientY: PRESS_Y,
  });
  probe.cleanup();

  assert.equal(probe.canvas.hasPointerCapture(FIRST_POINTER), false);
  assert.equal(probe.clickCount, 0);
  assert.equal(probe.inspectCount, 0);
});

test("MOB-05 pointerleave with touch after pointerup does not clear the pointed unit", () => {
  const probe = mountPointerProbe();

  dispatchPointer(probe.canvas, "pointerdown", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: PRESS_X,
    clientY: PRESS_Y,
  });
  dispatchPointer(probe.canvas, "pointerup", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: PRESS_X,
    clientY: PRESS_Y,
  });
  dispatchPointer(probe.canvas, "pointerleave", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
  });
  assert.equal(probe.leaveCount, 0);

  dispatchPointer(probe.canvas, "pointerleave", {
    pointerId: FIRST_POINTER,
    pointerType: "mouse",
  });
  probe.cleanup();

  assert.equal(probe.leaveCount, 1);
});

test("MOB-05 touch pointermove does not tilt the camera while mouse pointermove tilts", () => {
  const probe = mountPointerProbe({ isTiltOn: true });

  dispatchPointer(probe.canvas, "pointermove", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: 180,
    clientY: 80,
  });
  assert.equal(probe.tiltTarget.x, 0);
  assert.equal(probe.tiltTarget.y, 0);

  dispatchPointer(probe.canvas, "pointermove", {
    pointerId: FIRST_POINTER,
    pointerType: "mouse",
    clientX: 180,
    clientY: 80,
  });
  probe.cleanup();

  assert.notEqual(probe.tiltTarget.x, 0);
});

test("MOB-04 a short touch tap up to 10px inspects and points without triggering click selection", () => {
  const probe = mountPointerProbe();

  dispatchPointer(probe.canvas, "pointerdown", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: PRESS_X,
    clientY: PRESS_Y,
  });
  dispatchPointer(probe.canvas, "pointermove", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: PRESS_X + 8,
    clientY: PRESS_Y + 6,
  });
  dispatchPointer(probe.canvas, "pointerup", {
    pointerId: FIRST_POINTER,
    pointerType: "touch",
    clientX: PRESS_X + 8,
    clientY: PRESS_Y + 6,
  });
  probe.cleanup();

  assert.equal(probe.clickCount, 0);
  assert.equal(probe.inspectCount, 1);
  assert.equal(probe.moveCount, 2);
});

/**
 * @typedef {{
 *   canvas: any;
 *   clickCount: number;
 *   inspectCount: number;
 *   moveCount: number;
 *   leaveCount: number;
 *   panStartCount: number;
 *   panCount: number;
 *   wheelEvents: Array<{ deltaPixels: number; x: number; y: number }>;
 *   tiltTarget: { x: number; y: number };
 *   cleanup: () => void;
 * }} PointerProbe
 */

/**
 * @param {{ isTiltOn?: boolean }} [options]
 * @returns {PointerProbe}
 */
function mountPointerProbe(options = {}) {
  const canvas = createFakeCanvas();
  const isTiltEnabled = Boolean(options.isTiltOn);
  /** @type {PointerProbe} */
  const probe = {
    canvas,
    clickCount: 0,
    inspectCount: 0,
    moveCount: 0,
    leaveCount: 0,
    panStartCount: 0,
    panCount: 0,
    wheelEvents: [],
    tiltTarget: { x: 0, y: 0 },
    cleanup: () => {},
  };

  probe.cleanup = setupPointerHandlers({
    canvas,
    onPointerMove: () => {
      probe.moveCount += 1;
    },
    onPointerLeave: () => {
      probe.leaveCount += 1;
    },
    onClick: () => {
      probe.clickCount += 1;
    },
    onInspect: () => {
      probe.inspectCount += 1;
    },
    onPanStart: () => {
      probe.panStartCount += 1;
    },
    onPan: () => {
      probe.panCount += 1;
    },
    onWheel: (wheel) => {
      probe.wheelEvents.push(wheel);
    },
    readGroundPoint: () => new THREE.Vector3(0, 0, 0),
    isPannable: () => true,
    isTiltOn: () => isTiltEnabled,
    setTiltTarget: (x, y) => {
      probe.tiltTarget = { x, y };
    },
  });
  return probe;
}

/**
 * @param {any} canvas
 * @param {Record<string, any>} init
 */
function pressAndRelease(canvas, init) {
  dispatchPointer(canvas, "pointerdown", init);
  dispatchPointer(canvas, "pointerup", init);
}

/**
 * A pointer event at the press position, for the first pointer and the primary button, unless the
 * init says otherwise.
 * @param {any} canvas
 * @param {string} type
 * @param {Record<string, any>} [init]
 */
function dispatchPointer(canvas, type, init = {}) {
  canvas.dispatchEvent({
    type,
    defaultPrevented: false,
    clientX: PRESS_X,
    clientY: PRESS_Y,
    pointerId: FIRST_POINTER,
    button: PRIMARY_BUTTON,
    ...init,
  });
}

/**
 * @returns {any}
 */
function createFakeCanvas() {
  /** @type {Map<string, Set<(event: any) => void>>} */
  const listeners = new Map();
  /** @type {Set<number>} */
  const capturedPointers = new Set();

  return {
    style: { touchAction: "" },
    clientWidth: 200,
    clientHeight: 100,
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 200, height: 100 };
    },
    /** @param {number} pointerId */
    setPointerCapture(pointerId) {
      capturedPointers.add(pointerId);
    },
    /** @param {number} pointerId */
    releasePointerCapture(pointerId) {
      capturedPointers.delete(pointerId);
    },
    /** @param {number} pointerId */
    hasPointerCapture(pointerId) {
      return capturedPointers.has(pointerId);
    },
    /**
     * @param {string} type
     * @param {(event: any) => void} handler
     */
    addEventListener(type, handler) {
      const handlers = listeners.get(type) ?? new Set();
      handlers.add(handler);
      listeners.set(type, handlers);
    },
    /**
     * @param {string} type
     * @param {(event: any) => void} handler
     */
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    /** @param {{ type: string }} event */
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) ?? []) {
        handler(event);
      }
    },
  };
}
