import * as THREE from "three";
import {
  BORDER_OFFSET,
  EASING_PER_FRAME,
  FRAME_SAMPLE_SIZE,
  HEIGHT_EASING_PER_FRAME,
  LIFT_DURATION_MS,
  PLATE_DEPTH,
  RAISE_LIFT,
} from "./constants.js";

const HEIGHT_SNAP_DIFFERENCE = 0.004;
const TILT_SNAP_DISTANCE = 0.0005;
const ZOOM_SNAP_DIFFERENCE = 0.002;
const PAN_SNAP_DISTANCE = 0.01;
const FIRST_FRAME_ELAPSED_MS = 16;
const MAX_FRAME_ELAPSED_MS = 50;

const scratchMatrix = new THREE.Matrix4();

/**
 * Height and lift of every municipality, current and target, and the plate they place.
 * @typedef {{
 *   plate: THREE.BatchedMesh;
 *   municipalities: Array<{ instanceId: number }>;
 *   heightCurrent: Float32Array;
 *   heightTargets: Float32Array;
 *   liftCurrent: Float32Array;
 *   liftTargets: Float32Array;
 *   movingLifts: Set<number>;
 *   isHeightMoving: boolean;
 *   isMotionReduced: boolean;
 * }} MapMotion
 */

/**
 * Who is raised: the pointed municipality and the selected ones, and which of them lift.
 * @typedef {{
 *   pointed: number | Set<number> | null;
 *   pointedIndexes?: Set<number>;
 *   selected: Set<number>;
 *   isLiftEnabled: { pointed: boolean; selected: boolean };
 * }} RaiseState
 */

/**
 * @typedef {{
 *   camera: THREE.PerspectiveCamera;
 *   zoomState: { current: number; target: number };
 *   pan: THREE.Vector3;
 *   panTarget: THREE.Vector3;
 *   isMotionReduced: boolean;
 * }} CameraMotion
 */

/**
 * @param {THREE.BatchedMesh} plate
 * @param {Array<{ instanceId: number }>} municipalities
 * @returns {MapMotion}
 */
export function createMapMotion(plate, municipalities) {
  const municipalityCount = municipalities.length;
  return {
    plate,
    municipalities,
    heightCurrent: new Float32Array(municipalityCount).fill(1),
    heightTargets: new Float32Array(municipalityCount).fill(1),
    liftCurrent: new Float32Array(municipalityCount),
    liftTargets: new Float32Array(municipalityCount),
    movingLifts: new Set(),
    isHeightMoving: false,
    isMotionReduced: false,
  };
}

/**
 * Eases every height toward its target and places each changed block with its current lift, so a
 * raised municipality stays up while its height moves. Returns whether any height still moves.
 * @param {MapMotion} motion
 * @returns {boolean}
 */
export function stepHeights(motion) {
  if (!motion.isHeightMoving) {
    return false;
  }

  let isStillMoving = false;
  for (let index = 0; index < motion.municipalities.length; index += 1) {
    const isIndexMoving = stepHeight(motion, index);
    isStillMoving = isStillMoving || isIndexMoving;
  }

  motion.isHeightMoving = isStillMoving;
  return isStillMoving;
}

/**
 * @param {MapMotion} motion
 * @param {number} index
 * @returns {boolean}
 */
function stepHeight(motion, index) {
  const difference = motion.heightTargets[index] - motion.heightCurrent[index];
  if (difference === 0) {
    return false;
  }

  const isMoving = easeHeight(motion, index, difference);
  placeMunicipality(motion, index);
  return isMoving;
}

/**
 * @param {MapMotion} motion
 * @param {number} index
 * @param {number} difference
 * @returns {boolean}
 */
function easeHeight(motion, index, difference) {
  const isArriving = motion.isMotionReduced || Math.abs(difference) < HEIGHT_SNAP_DIFFERENCE;
  if (isArriving) {
    motion.heightCurrent[index] = motion.heightTargets[index];
    return false;
  }

  motion.heightCurrent[index] += difference * HEIGHT_EASING_PER_FRAME;
  return true;
}

/**
 * Writes the block matrix from the current height and the current lift.
 * @param {MapMotion} motion
 * @param {number} index
 */
export function placeMunicipality(motion, index) {
  scratchMatrix.makeScale(1, 1, motion.heightCurrent[index]);
  scratchMatrix.setPosition(0, 0, motion.liftCurrent[index]);
  motion.plate.setMatrixAt(motion.municipalities[index].instanceId, scratchMatrix);
}

/**
 * Moves each moving lift by at most its share of the elapsed time and places the block with its
 * current height. Returns whether any lift still moves.
 * @param {MapMotion} motion
 * @param {number} elapsed
 * @returns {boolean}
 */
export function stepLifts(motion, elapsed) {
  const maximumStep = (RAISE_LIFT * elapsed) / LIFT_DURATION_MS;

  for (const index of motion.movingLifts) {
    const isArriving = advanceLift(motion, index, maximumStep);
    if (isArriving) {
      motion.movingLifts.delete(index);
    }
    placeMunicipality(motion, index);
  }

  return motion.movingLifts.size > 0;
}

/**
 * @param {MapMotion} motion
 * @param {number} index
 * @param {number} maximumStep
 * @returns {boolean}
 */
function advanceLift(motion, index, maximumStep) {
  const target = motion.liftTargets[index];
  const difference = target - motion.liftCurrent[index];
  const isArriving = motion.isMotionReduced || Math.abs(difference) <= maximumStep;
  if (isArriving) {
    motion.liftCurrent[index] = target;
    return true;
  }

  motion.liftCurrent[index] += Math.sign(difference) * maximumStep;
  return false;
}

/**
 * Sets the lift target of every municipality from the raise state and queues the ones that change.
 * @param {MapMotion} motion
 * @param {RaiseState} raise
 */
export function retargetLifts(motion, raise) {
  for (let index = 0; index < motion.municipalities.length; index += 1) {
    const liftTarget = readLiftTarget(motion, raise, index);
    if (liftTarget === motion.liftTargets[index]) {
      continue;
    }
    motion.liftTargets[index] = liftTarget;
    motion.movingLifts.add(index);
  }
}

/**
 * Nothing rises when the reader asked for reduced motion; the color alone marks the city.
 * @param {MapMotion} motion
 * @param {RaiseState} raise
 * @param {number} index
 * @returns {number}
 */
function readLiftTarget(motion, raise, index) {
  if (motion.isMotionReduced) {
    return 0;
  }
  if (!isLifted(raise, index)) {
    return 0;
  }
  return RAISE_LIFT;
}

/**
 * @param {RaiseState} raise
 * @param {number} index
 * @returns {boolean}
 */
function isLifted(raise, index) {
  if (raise.isLiftEnabled.pointed && isPointed(raise, index)) {
    return true;
  }
  if (!raise.isLiftEnabled.selected) {
    return false;
  }
  return raise.selected.has(index);
}

/**
 * @param {RaiseState} raise
 * @param {number} index
 * @returns {boolean}
 */
function isPointed(raise, index) {
  if (raise.pointedIndexes instanceof Set) {
    return raise.pointedIndexes.has(index);
  }
  if (raise.pointed instanceof Set) {
    return raise.pointed.has(index);
  }
  return raise.pointed === index;
}

/**
 * The municipalities that carry the raised outline: the selected ones and the pointed one.
 * @param {RaiseState} raise
 * @returns {number[]}
 */
export function readRaisedIndexes(raise) {
  const raisedIndexes = new Set(raise.selected);
  if (raise.pointedIndexes instanceof Set) {
    for (const index of raise.pointedIndexes) {
      raisedIndexes.add(index);
    }
  } else if (raise.pointed instanceof Set) {
    for (const index of raise.pointed) {
      raisedIndexes.add(index);
    }
  } else if (raise.pointed !== null && raise.pointed !== undefined) {
    raisedIndexes.add(raise.pointed);
  }
  return [...raisedIndexes];
}

/**
 * @param {Array<{ code: string }>} municipalities
 * @returns {Map<string, number>}
 */
export function buildIndexByCode(municipalities) {
  return new Map(municipalities.map((municipality, index) => [municipality.code, index]));
}

/**
 * Turns the raised unit codes into municipality indexes. A code the map does not draw is dropped.
 * @param {Map<string, number>} indexByCode
 * @param {{ pointed: string | readonly string[] | null; selected: readonly string[] }} raised
 * @returns {{ pointed: number | Set<number> | null; pointedIndexes: Set<number>; selected: Set<number> }}
 */
export function readRaisedUnitIndexes(indexByCode, { pointed, selected }) {
  /** @type {Set<number>} */
  const selectedIndexes = new Set();
  for (const code of selected) {
    const index = indexByCode.get(code);
    if (index === undefined) {
      continue;
    }
    selectedIndexes.add(index);
  }

  /** @type {Set<number>} */
  const pointedIndexes = new Set();
  if (Array.isArray(pointed)) {
    for (const code of pointed) {
      const index = indexByCode.get(code);
      if (index !== undefined) {
        pointedIndexes.add(index);
      }
    }
  } else if (typeof pointed === "string") {
    const index = indexByCode.get(pointed);
    if (index !== undefined) {
      pointedIndexes.add(index);
    }
  }

  const singlePointed = Array.isArray(pointed)
    ? pointedIndexes.size > 0
      ? pointedIndexes
      : null
    : typeof pointed === "string"
      ? readPointedIndex(indexByCode, pointed)
      : null;

  return { pointed: singlePointed, pointedIndexes, selected: selectedIndexes };
}

/**
 * @param {Map<string, number>} indexByCode
 * @param {string | null | undefined} pointed
 * @returns {number | null}
 */
function readPointedIndex(indexByCode, pointed) {
  if (pointed === null || pointed === undefined) {
    return null;
  }
  return indexByCode.get(pointed) ?? null;
}

/**
 * @param {number} heightScale
 * @returns {number}
 */
export function readTopHeight(heightScale) {
  return PLATE_DEPTH * heightScale;
}

/**
 * Rewrites only the z of each line vertex from the height of its owner. The borders take no share
 * of the lift (0); the raised outline follows it (1).
 * @param {THREE.LineSegments} lines
 * @param {MapMotion} motion
 * @param {number} liftShare
 */
export function updateLineHeights(lines, motion, liftShare) {
  const positionAttribute = lines.geometry.attributes.position;
  const owners = lines.geometry.userData.owners;
  if (!owners) {
    return;
  }

  const positions = positionAttribute.array;
  for (let vertexIndex = 0; vertexIndex < owners.length; vertexIndex += 1) {
    const owner = owners[vertexIndex];
    const topHeight = readTopHeight(motion.heightCurrent[owner]);
    positions[vertexIndex * 3 + 2] =
      topHeight + BORDER_OFFSET + liftShare * motion.liftCurrent[owner];
  }
  positionAttribute.needsUpdate = true;
}

/**
 * @param {{
 *   tilt: THREE.Vector2;
 *   tiltTarget: THREE.Vector2;
 *   isMotionReduced: boolean;
 * }} options
 * @returns {boolean}
 */
export function stepTilt({ tilt, tiltTarget, isMotionReduced }) {
  if (isMotionReduced) {
    tiltTarget.set(0, 0);
  }

  if (tilt.distanceTo(tiltTarget) < TILT_SNAP_DISTANCE) {
    tilt.copy(tiltTarget);
    return false;
  }

  tilt.lerp(tiltTarget, EASING_PER_FRAME);
  return true;
}

/**
 * Eases zoom and pan toward their targets and hands the zoom to the camera. Returns whether either
 * still moves.
 * @param {CameraMotion} cameraMotion
 * @returns {boolean}
 */
export function stepCamera(cameraMotion) {
  const isZoomMoving = stepZoom(cameraMotion);
  const isPanMoving = stepPan(cameraMotion);

  cameraMotion.camera.zoom = cameraMotion.zoomState.current;
  cameraMotion.camera.updateProjectionMatrix();
  return isZoomMoving || isPanMoving;
}

/**
 * @param {CameraMotion} cameraMotion
 * @returns {boolean}
 */
function stepZoom({ zoomState, isMotionReduced }) {
  const difference = Math.abs(zoomState.target - zoomState.current);
  if (isMotionReduced || difference < ZOOM_SNAP_DIFFERENCE) {
    zoomState.current = zoomState.target;
    return false;
  }

  zoomState.current = THREE.MathUtils.lerp(zoomState.current, zoomState.target, EASING_PER_FRAME);
  return true;
}

/**
 * @param {CameraMotion} cameraMotion
 * @returns {boolean}
 */
function stepPan({ pan, panTarget, isMotionReduced }) {
  if (isMotionReduced || pan.distanceTo(panTarget) < PAN_SNAP_DISTANCE) {
    pan.copy(panTarget);
    return false;
  }

  pan.lerp(panTarget, EASING_PER_FRAME);
  return true;
}

/**
 * @param {number | undefined} previousTime
 * @param {number} now
 * @returns {number}
 */
export function readElapsed(previousTime, now) {
  if (previousTime === undefined) {
    return FIRST_FRAME_ELAPSED_MS;
  }
  return Math.min(now - previousTime, MAX_FRAME_ELAPSED_MS);
}

/**
 * Keeps the last FRAME_SAMPLE_SIZE render durations.
 * @param {number[]} samples
 * @param {number} milliseconds
 */
export function recordFrameSample(samples, milliseconds) {
  samples.push(milliseconds);
  if (samples.length > FRAME_SAMPLE_SIZE) {
    samples.shift();
  }
}

/**
 * @param {number[]} samples
 * @returns {number}
 */
export function readMedianSample(samples) {
  if (samples.length === 0) {
    return 0;
  }
  const sortedSamples = [...samples].sort((first, second) => first - second);
  return sortedSamples[Math.floor(sortedSamples.length / 2)];
}
