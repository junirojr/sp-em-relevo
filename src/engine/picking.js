import * as THREE from "three";
import { readTopHeight } from "./frame-loop.js";

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

const scratch = {
  inverseMatrix: new THREE.Matrix4(),
  ray: new THREE.Ray(),
  plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
  point: new THREE.Vector3(),
};

/**
 * What a pick reads: the camera and the map, and the current height and lift of each block. The
 * typed arrays are read in place, never copied.
 * @typedef {{
 *   camera: THREE.Camera;
 *   raycaster: THREE.Raycaster;
 *   plate: THREE.BatchedMesh;
 *   mapGroup: THREE.Object3D;
 *   municipalities: Array<{ outline: Float32Array }>;
 *   instanceToMunicipality: number[];
 *   heightCurrent: Float32Array;
 *   liftCurrent: Float32Array;
 * }} PickTarget
 */

/**
 * @typedef {{
 *   markPickPending: () => void;
 *   flushPendingPick: () => void;
 *   clearPointed: () => void;
 *   readPointedIndex: () => number | null;
 * }} PointTracker
 */

/**
 * Picks at most once per frame, however many pointer moves arrive, and reports only a change of
 * the pointed municipality. Clearing the pointed municipality also drops the pick still waiting for
 * the frame, so the pointing does not come back after the pointer left or a pan began.
 * @param {{
 *   pickIndex: () => number | null | undefined;
 *   onChange: (index: number | null) => void;
 * }} options
 * @returns {PointTracker}
 */
export function createPointTracker({ pickIndex, onChange }) {
  const tracker = {
    pointedIndex: /** @type {number | null} */ (null),
    isPickPending: false,
  };

  return {
    markPickPending() {
      tracker.isPickPending = true;
    },
    flushPendingPick() {
      if (!tracker.isPickPending) {
        return;
      }
      tracker.isPickPending = false;
      changePointed(pickIndex() ?? null);
    },
    clearPointed() {
      tracker.isPickPending = false;
      changePointed(null);
    },
    readPointedIndex() {
      return tracker.pointedIndex;
    },
  };

  /**
   * @param {number | null} index
   */
  function changePointed(index) {
    if (index === tracker.pointedIndex) {
      return;
    }
    tracker.pointedIndex = index;
    onChange(index);
  }
}

/**
 * A raised city moves away from the cursor on screen. Keeping it while the cursor is still over the
 * place it rose from stops the pointing from flickering and lets a click find it where it belongs.
 * @param {THREE.Vector2} ndc
 * @param {PickTarget} target
 * @param {Iterable<number | null>} candidates
 * @returns {number | undefined}
 */
export function pickMunicipalityIndex(ndc, target, candidates) {
  target.raycaster.setFromCamera(ndc, target.camera);

  const restingIndex = findRestingFootprintIndex(target, candidates);
  if (restingIndex !== undefined) {
    return restingIndex;
  }

  const hit = target.raycaster.intersectObject(target.plate, false)[0];
  if (!hit) {
    return undefined;
  }
  if (hit.batchId === undefined) {
    return undefined;
  }

  return target.instanceToMunicipality[hit.batchId];
}

/**
 * @param {PickTarget} target
 * @param {Iterable<number | null>} candidates
 * @returns {number | undefined}
 */
function findRestingFootprintIndex(target, candidates) {
  for (const index of candidates) {
    if (index === null || index < 0 || index >= target.municipalities.length) {
      continue;
    }
    if (target.liftCurrent[index] <= 0) {
      continue;
    }
    if (isRayOverRestingFootprint(target, index)) {
      return index;
    }
  }

  return undefined;
}

/**
 * @param {PickTarget} target
 * @param {number} index
 * @returns {boolean}
 */
function isRayOverRestingFootprint(target, index) {
  scratch.inverseMatrix.copy(target.mapGroup.matrixWorld).invert();
  scratch.ray.copy(target.raycaster.ray).applyMatrix4(scratch.inverseMatrix);
  scratch.plane.constant = -readTopHeight(target.heightCurrent[index]);

  const hitPoint = scratch.ray.intersectPlane(scratch.plane, scratch.point);
  if (!hitPoint) {
    return false;
  }

  return isPointInOutline(hitPoint.x, hitPoint.y, target.municipalities[index].outline);
}

/**
 * Even-odd crossing test over the segment list, which also handles holes and islands.
 * @param {number} x
 * @param {number} y
 * @param {Float32Array} outline
 * @returns {boolean}
 */
export function isPointInOutline(x, y, outline) {
  let isInside = false;

  for (let index = 0; index < outline.length; index += 4) {
    const startX = outline[index];
    const startY = outline[index + 1];
    const endX = outline[index + 2];
    const endY = outline[index + 3];

    if (startY > y === endY > y) {
      continue;
    }

    const crossingX = ((endX - startX) * (y - startY)) / (endY - startY) + startX;
    if (x < crossingX) {
      isInside = !isInside;
    }
  }

  return isInside;
}

/**
 * Reads the point of the ground (world z = 0) under a screen position.
 * @param {THREE.Vector2} ndc
 * @param {{ camera: THREE.Camera; raycaster: THREE.Raycaster }} viewer
 * @param {THREE.Vector3} target
 * @returns {THREE.Vector3 | null}
 */
export function readGroundPoint(ndc, { camera, raycaster }, target) {
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(GROUND_PLANE, target);
}
