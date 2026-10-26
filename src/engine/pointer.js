import * as THREE from "three";
import { DRAG_THRESHOLD_PX, MAX_TILT_RADIANS } from "./constants.js";

const PRIMARY_BUTTON = 0;
const TOUCH_POINTER_TYPE = "touch";
const TOUCH_TAP_THRESHOLD_PX = 10;
const VERTICAL_TILT_SHARE = 0.6;
const WHEEL_LINE_PX = 40;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;

/**
 * A wheel or pinch turn, in pixels, and the cursor in client CSS pixels.
 * @typedef {{ deltaPixels: number; x: number; y: number }} WheelInput
 */

/**
 * @typedef {{
 *   canvas: HTMLElement;
 *   onPointerMove: (ndc: THREE.Vector2) => void;
 *   onPointerLeave: () => void;
 *   onClick: (ndc: THREE.Vector2) => void;
 *   onInspect?: (ndc: THREE.Vector2) => void;
 *   onPanStart: () => void;
 *   onPan: (delta: THREE.Vector3) => void;
 *   onWheel: (wheel: WheelInput) => void;
 *   readGroundPoint: (ndc: THREE.Vector2) => THREE.Vector3 | null;
 *   isPannable: () => boolean;
 *   isTiltOn: () => boolean;
 *   setTiltTarget: (x: number, y: number) => void;
 * }} PointerHandlerOptions
 */

/**
 * The handler options plus the last pointer position, in normalized device coordinates.
 * @typedef {PointerHandlerOptions & { pointerNdc: THREE.Vector2 }} PointerInput
 */

/** @typedef {{ pointerId: number; x: number; y: number }} TouchPoint */

/**
 * A press on the map. Only the pointer that started it can end it. It is dragged once it travels the
 * threshold, and from then on its release is no click. A press of an auxiliary button (middle,
 * secondary, back, forward) never clicks, so it cannot select or deselect.
 * @typedef {{
 *   pointerId: number;
 *   isTouch: boolean;
 *   isAuxiliaryButton: boolean;
 *   startX: number;
 *   startY: number;
 *   isDragged: boolean;
 *   hasPanStarted: boolean;
 *   grabPoint: THREE.Vector3 | undefined;
 * }} DragGesture
 */

/**
 * Wires the map input. A move points (the engine picks once per frame) and tilts; a drag past the
 * threshold pans while zoomed in; a release of a primary button press that did not drag is a click.
 * The wheel and the pinch zoom the map, never the page.
 * @param {PointerHandlerOptions} options
 * @returns {() => void} cleanup function
 */
export function setupPointerHandlers(options) {
  /** @type {PointerInput} */
  const input = { ...options, pointerNdc: new THREE.Vector2() };
  const { canvas } = input;
  /** @type {DragGesture | undefined} */
  let drag;
  /** @type {Map<number, TouchPoint>} */
  const touches = new Map();
  let pinchDistance = 0;
  let wasPinch = false;

  if (canvas.style) {
    canvas.style.touchAction = "none";
  }

  /** @param {PointerEvent} event */
  function handlePointerDown(event) {
    capturePointer(canvas, event.pointerId);
    const isTouch = event.pointerType === TOUCH_POINTER_TYPE;
    if (isTouch) {
      touches.set(event.pointerId, {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      });
      if (touches.size === 2) {
        wasPinch = true;
        pinchDistance = readPinchMetrics(touches).distance;
        return;
      }
      if (touches.size > 1) {
        return;
      }
      wasPinch = false;
    }
    if (drag) {
      return;
    }
    drag = {
      pointerId: event.pointerId,
      isTouch,
      isAuxiliaryButton: event.button !== PRIMARY_BUTTON,
      startX: event.clientX,
      startY: event.clientY,
      isDragged: false,
      hasPanStarted: false,
      grabPoint: undefined,
    };
  }

  /** @param {PointerEvent} event */
  function handlePointerMove(event) {
    const isTouch = event.pointerType === TOUCH_POINTER_TYPE;
    if (isTouch) {
      const tracked = touches.get(event.pointerId);
      if (tracked) {
        tracked.x = event.clientX;
        tracked.y = event.clientY;
      }
      if (touches.size === 2) {
        pinchDistance = followPinch(input, touches, pinchDistance, drag);
        return;
      }
      if (touches.size > 2) {
        return;
      }
    }
    if (drag && event.pointerId !== drag.pointerId) {
      return;
    }

    writePointerNdc(input, event);
    if (drag && followDrag(input, drag, event)) {
      return;
    }

    if (!isTouch) {
      followTilt(input);
    }
    input.onPointerMove(input.pointerNdc);
  }

  /** @param {PointerEvent} event */
  function handlePointerUp(event) {
    if (event.pointerType === TOUCH_POINTER_TYPE) {
      touches.delete(event.pointerId);
      releaseCapture(canvas, event.pointerId);
      if (touches.size === 2) {
        pinchDistance = readPinchMetrics(touches).distance;
        return;
      }
      if (touches.size === 1) {
        pinchDistance = 0;
        drag = reanchorRemainingTouch(touches, drag);
        return;
      }
      if (touches.size > 2) {
        return;
      }
      pinchDistance = 0;
      const releasedTouchDrag = drag;
      const endedPinch = wasPinch;
      drag = undefined;
      wasPinch = false;
      if (!releasedTouchDrag || releasedTouchDrag.isDragged || endedPinch) {
        return;
      }
      writePointerNdc(input, event);
      input.onPointerMove(input.pointerNdc);
      input.onInspect?.(input.pointerNdc);
      return;
    }

    const releasedDrag = drag;
    if (!releasedDrag || event.pointerId !== releasedDrag.pointerId) {
      return;
    }

    drag = undefined;
    releaseCapture(canvas, event.pointerId);
    if (!isClickRelease(releasedDrag)) {
      return;
    }

    writePointerNdc(input, event);
    input.onClick(input.pointerNdc);
  }

  /** @param {PointerEvent} event */
  function handlePointerCancel(event) {
    touches.clear();
    pinchDistance = 0;
    wasPinch = false;
    drag = undefined;
    releaseCapture(canvas, event.pointerId);
  }

  /** @param {PointerEvent} [event] */
  function handlePointerLeave(event) {
    if (event?.pointerType === TOUCH_POINTER_TYPE) {
      return;
    }
    input.setTiltTarget(0, 0);
    input.onPointerLeave();
  }

  /** @param {Event} event */
  function handleContextMenu(event) {
    event.preventDefault();
  }

  /** @param {WheelEvent} event */
  function handleWheel(event) {
    event.preventDefault();
    input.onWheel({
      deltaPixels: readWheelPixels(event, canvas),
      x: event.clientX,
      y: event.clientY,
    });
  }

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerCancel);
  canvas.addEventListener("pointerleave", handlePointerLeave);
  canvas.addEventListener("contextmenu", handleContextMenu);
  canvas.addEventListener("wheel", handleWheel, { passive: false });

  return function cleanup() {
    canvas.removeEventListener("pointerdown", handlePointerDown);
    canvas.removeEventListener("pointermove", handlePointerMove);
    canvas.removeEventListener("pointerup", handlePointerUp);
    canvas.removeEventListener("pointercancel", handlePointerCancel);
    canvas.removeEventListener("pointerleave", handlePointerLeave);
    canvas.removeEventListener("contextmenu", handleContextMenu);
    canvas.removeEventListener("wheel", handleWheel);
  };
}

/**
 * Listens to the loss and the return of the WebGL context. Preventing the default keeps a lost
 * context restorable.
 * @param {{ canvas: HTMLElement; onLost: () => void; onRestored: () => void }} options
 * @returns {() => void} cleanup function
 */
export function setupContextHandlers({ canvas, onLost, onRestored }) {
  /** @param {Event} event */
  function handleContextLost(event) {
    event.preventDefault();
    onLost();
  }

  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  return function cleanup() {
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
  };
}

/**
 * @param {HTMLElement} canvas
 * @param {number} pointerId
 */
function capturePointer(canvas, pointerId) {
  try {
    canvas.setPointerCapture(pointerId);
  } catch {}
}

/**
 * @param {HTMLElement} canvas
 * @param {number} pointerId
 */
function releaseCapture(canvas, pointerId) {
  if (!canvas.hasPointerCapture(pointerId)) {
    return;
  }
  try {
    canvas.releasePointerCapture(pointerId);
  } catch {}
}

/**
 * @param {Map<number, TouchPoint>} touches
 * @returns {{ distance: number; x: number; y: number }}
 */
function readPinchMetrics(touches) {
  const [first, second] = touches.values();
  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

/**
 * @param {PointerInput} input
 * @param {Map<number, TouchPoint>} touches
 * @param {number} previousDistance
 * @param {DragGesture | undefined} drag
 * @returns {number}
 */
function followPinch(input, touches, previousDistance, drag) {
  const metrics = readPinchMetrics(touches);
  if (drag) {
    drag.isDragged = true;
    drag.grabPoint = undefined;
  }
  if (previousDistance > 0 && previousDistance !== metrics.distance) {
    input.onWheel({
      deltaPixels: previousDistance - metrics.distance,
      x: metrics.x,
      y: metrics.y,
    });
  }
  return metrics.distance;
}

/**
 * @param {Map<number, TouchPoint>} touches
 * @param {DragGesture | undefined} drag
 * @returns {DragGesture | undefined}
 */
function reanchorRemainingTouch(touches, drag) {
  const [remaining] = touches.values();
  if (!remaining) {
    return undefined;
  }
  if (drag && drag.pointerId === remaining.pointerId && drag.grabPoint) {
    return drag;
  }
  return {
    pointerId: remaining.pointerId,
    isTouch: true,
    isAuxiliaryButton: false,
    startX: remaining.x,
    startY: remaining.y,
    isDragged: true,
    hasPanStarted: Boolean(drag?.hasPanStarted),
    grabPoint: undefined,
  };
}

/**
 * @param {DragGesture} gesture
 * @returns {boolean}
 */
function isClickRelease(gesture) {
  if (gesture.isDragged || gesture.isTouch) {
    return false;
  }
  return !gesture.isAuxiliaryButton;
}

/**
 * @param {PointerInput} input
 * @param {PointerEvent} event
 */
function writePointerNdc({ canvas, pointerNdc }, event) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }
  pointerNdc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

/**
 * @param {DragGesture} drag
 * @param {number} movedDistance
 * @returns {boolean}
 */
function hasPassedDragThreshold(drag, movedDistance) {
  if (drag.isTouch) {
    return movedDistance > TOUCH_TAP_THRESHOLD_PX;
  }
  return movedDistance >= DRAG_THRESHOLD_PX;
}

/**
 * @param {PointerInput} input
 * @param {DragGesture} drag
 * @param {PointerEvent} event
 * @returns {boolean}
 */
function followDrag(input, drag, event) {
  const movedDistance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (hasPassedDragThreshold(drag, movedDistance)) {
    drag.isDragged = true;
  }
  if (!drag.isDragged || !input.isPannable()) {
    return false;
  }
  return dragPan(input, drag);
}

/**
 * @param {PointerInput} input
 * @param {DragGesture} drag
 * @returns {boolean}
 */
function dragPan(input, drag) {
  const pointUnderCursor = input.readGroundPoint(input.pointerNdc);
  if (!pointUnderCursor) {
    return true;
  }

  if (!drag.grabPoint) {
    drag.grabPoint = pointUnderCursor;
    if (drag.isTouch) {
      const rect = input.canvas.getBoundingClientRect();
      const startNdc = new THREE.Vector2(
        ((drag.startX - rect.left) / rect.width) * 2 - 1,
        -((drag.startY - rect.top) / rect.height) * 2 + 1,
      );
      drag.grabPoint = input.readGroundPoint(startNdc) ?? pointUnderCursor;
    }
    if (!drag.hasPanStarted) {
      drag.hasPanStarted = true;
      input.onPanStart();
    }
    if (drag.isTouch) input.onPan(drag.grabPoint.clone().sub(pointUnderCursor));
    return true;
  }

  input.onPan(drag.grabPoint.clone().sub(pointUnderCursor));
  return true;
}

/**
 * @param {PointerInput} input
 */
function followTilt({ isTiltOn, setTiltTarget, pointerNdc }) {
  if (!isTiltOn()) {
    setTiltTarget(0, 0);
    return;
  }

  setTiltTarget(
    pointerNdc.x * MAX_TILT_RADIANS,
    -pointerNdc.y * MAX_TILT_RADIANS * VERTICAL_TILT_SHARE,
  );
}

/**
 * Turns the wheel delta into pixels: a line notch counts as a few lines of text, a page as the
 * canvas height.
 * @param {WheelEvent} event
 * @param {HTMLElement} canvas
 * @returns {number}
 */
function readWheelPixels(event, canvas) {
  if (event.deltaMode === WHEEL_DELTA_LINE) {
    return event.deltaY * WHEEL_LINE_PX;
  }
  if (event.deltaMode === WHEEL_DELTA_PAGE) {
    return event.deltaY * canvas.clientHeight;
  }
  return event.deltaY;
}
