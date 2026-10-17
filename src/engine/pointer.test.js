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

/**
 * @typedef {{
 *   canvas: any;
 *   clickCount: number;
 *   panStartCount: number;
 *   panCount: number;
 *   cleanup: () => void;
 * }} PointerProbe
 */

/**
 * @returns {PointerProbe}
 */
function mountPointerProbe() {
  const canvas = createFakeCanvas();
  /** @type {PointerProbe} */
  const probe = { canvas, clickCount: 0, panStartCount: 0, panCount: 0, cleanup: () => {} };

  probe.cleanup = setupPointerHandlers({
    canvas,
    onPointerMove: () => {},
    onPointerLeave: () => {},
    onClick: () => {
      probe.clickCount += 1;
    },
    onPanStart: () => {
      probe.panStartCount += 1;
    },
    onPan: () => {
      probe.panCount += 1;
    },
    onWheel: () => {},
    readGroundPoint: () => new THREE.Vector3(0, 0, 0),
    isPannable: () => true,
    isTiltOn: () => false,
    setTiltTarget: () => {},
  });
  return probe;
}

/**
 * @param {any} canvas
 * @param {Record<string, number>} init
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
 * @param {Record<string, number>} init
 */
function dispatchPointer(canvas, type, init) {
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
