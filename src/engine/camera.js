import * as THREE from "three";
import {
  BASE_AZIMUTH_RADIANS,
  FIT_MARGIN,
  GROUP_SHARE_OF_MAP,
  MAX_FRAMING_ZOOM,
  SINGLE_CITY_MIN_ZOOM,
  SINGLE_CITY_SHARE_OF_MAP,
  WHEEL_STEP_THRESHOLD,
  WORLD_UNITS_PER_SVG_UNIT,
  ZOOM_LEVELS,
} from "./constants.js";
import { readGroundPoint } from "./picking.js";

const BISECTION_STEPS = 32;
const NEAREST_FIT_DISTANCE = 1;
const FARTHEST_FIT_DISTANCE = 4000;
const ZOOM_LEVEL_TOLERANCE = 0.01;
const GROUP_MIN_ZOOM = 1.02;

/**
 * Where the camera orbits: its distance to the pan point, the tilt that follows the pointer and the
 * view angle from the vertical.
 * @typedef {{
 *   distance: number;
 *   tilt: THREE.Vector2;
 *   pan: THREE.Vector3;
 *   viewAngleDegrees: number;
 * }} CameraOrbit
 */

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {CameraOrbit} orbit
 */
export function positionCamera(camera, { distance, tilt, pan, viewAngleDegrees }) {
  const polar = THREE.MathUtils.degToRad(viewAngleDegrees) + tilt.y;
  const azimuth = BASE_AZIMUTH_RADIANS + tilt.x;

  camera.position.set(
    pan.x + distance * Math.sin(polar) * Math.sin(azimuth),
    pan.y - distance * Math.sin(polar) * Math.cos(azimuth),
    pan.z + distance * Math.cos(polar),
  );
  camera.lookAt(pan);
  camera.updateMatrixWorld();
}

/**
 * Distance at which the whole map fits the stage at zoom 1, found by bisection on its corners.
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Vector3} mapSize in world units
 * @param {number} viewAngleDegrees
 * @returns {number}
 */
export function computeFitDistance(camera, mapSize, viewAngleDegrees) {
  const fitCamera = camera.clone();
  fitCamera.zoom = 1;
  fitCamera.updateProjectionMatrix();

  let nearDistance = NEAREST_FIT_DISTANCE;
  let farDistance = FARTHEST_FIT_DISTANCE;
  const restingOrbit = {
    distance: farDistance,
    tilt: new THREE.Vector2(),
    pan: new THREE.Vector3(),
    viewAngleDegrees,
  };

  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    restingOrbit.distance = (nearDistance + farDistance) / 2;
    positionCamera(fitCamera, restingOrbit);
    if (doesMapFit(fitCamera, mapSize)) {
      farDistance = restingOrbit.distance;
      continue;
    }
    nearDistance = restingOrbit.distance;
  }

  return farDistance;
}

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Vector3} mapSize in world units
 * @returns {boolean}
 */
export function doesMapFit(camera, mapSize) {
  const halfWidth = mapSize.x / 2;
  const halfHeight = mapSize.y / 2;
  const corners = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ];

  const testPoint = new THREE.Vector3();
  for (const [x, y] of corners) {
    testPoint.set(x, y, 0).project(camera);
    if (Math.abs(testPoint.x) > FIT_MARGIN) {
      return false;
    }
    if (Math.abs(testPoint.y) > FIT_MARGIN) {
      return false;
    }
  }

  return true;
}

/**
 * @param {THREE.Vector3} pan
 * @param {THREE.Vector3} mapSize in world units
 */
export function clampPanVector(pan, mapSize) {
  const halfWidth = mapSize.x / 2;
  const halfHeight = mapSize.y / 2;
  pan.x = THREE.MathUtils.clamp(pan.x, -halfWidth, halfWidth);
  pan.y = THREE.MathUtils.clamp(pan.y, -halfHeight, halfHeight);
}

/**
 * @param {number} zoomTarget
 * @returns {number}
 */
export function clampZoomTarget(zoomTarget) {
  return THREE.MathUtils.clamp(zoomTarget, 1, ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
}

/**
 * @param {number} zoomTarget
 * @returns {number}
 */
export function readNextZoomLevel(zoomTarget) {
  const nextLevel = ZOOM_LEVELS.find((level) => level > zoomTarget + ZOOM_LEVEL_TOLERANCE);
  return nextLevel ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
}

/**
 * @param {number} zoomTarget
 * @returns {number}
 */
export function readPreviousZoomLevel(zoomTarget) {
  const previousLevel = [...ZOOM_LEVELS]
    .reverse()
    .find((level) => level < zoomTarget - ZOOM_LEVEL_TOLERANCE);
  return previousLevel ?? 1;
}

/**
 * @param {number} zoomTarget
 * @param {number} direction positive zooms in, otherwise zooms out
 * @returns {number}
 */
export function readSteppedZoom(zoomTarget, direction) {
  if (direction > 0) {
    return readNextZoomLevel(zoomTarget);
  }
  return readPreviousZoomLevel(zoomTarget);
}

/**
 * The wheel and the pinch share it: their pixels add up until they pass the step threshold.
 * @returns {{ pixels: number }}
 */
export function createWheelAccumulator() {
  return { pixels: 0 };
}

/**
 * Adds a wheel or pinch delta. Passing the threshold steps once and starts over. Scrolling up, a
 * negative delta, zooms in.
 * @param {{ pixels: number }} accumulator
 * @param {number} deltaPixels
 * @returns {number} 1 zooms in, -1 zooms out, 0 keeps the level
 */
export function accumulateWheelZoom(accumulator, deltaPixels) {
  accumulator.pixels += deltaPixels;
  if (Math.abs(accumulator.pixels) < WHEEL_STEP_THRESHOLD) {
    return 0;
  }

  const direction = -Math.sign(accumulator.pixels);
  accumulator.pixels = 0;
  return direction;
}

/**
 * The pan that keeps a ground point under the cursor once the camera settles at a new zoom.
 * @param {{
 *   camera: THREE.PerspectiveCamera;
 *   orbit: CameraOrbit;
 *   cursorNdc: THREE.Vector2;
 *   zoom: number;
 *   groundPoint: THREE.Vector3;
 * }} options
 * @returns {THREE.Vector3 | null}
 */
export function readCursorZoomPan({ camera, orbit, cursorNdc, zoom, groundPoint }) {
  const settledCamera = camera.clone();
  settledCamera.zoom = zoom;
  settledCamera.updateProjectionMatrix();
  positionCamera(settledCamera, { ...orbit, pan: new THREE.Vector3() });

  const viewer = { camera: settledCamera, raycaster: new THREE.Raycaster() };
  const unpannedPoint = readGroundPoint(cursorNdc, viewer, new THREE.Vector3());
  if (!unpannedPoint) {
    return null;
  }
  return groundPoint.clone().sub(unpannedPoint);
}

/**
 * One city ends up centered and about a quarter of the map wide; a group fills most of the stage.
 * The bounds are in topology units, centered on the map; the map size is in world units.
 * @param {THREE.Box2[]} boundsList
 * @param {THREE.Vector3} mapSize in world units
 * @returns {{ pan: THREE.Vector3; zoom: number }}
 */
export function readSelectionFraming(boundsList, mapSize) {
  const selectionBounds = new THREE.Box2();
  for (const bounds of boundsList) {
    selectionBounds.union(bounds);
  }
  const center = selectionBounds.getCenter(new THREE.Vector2());
  const size = selectionBounds.getSize(new THREE.Vector2());
  const shareOfMap = Math.max(
    size.x / (mapSize.x / WORLD_UNITS_PER_SVG_UNIT),
    size.y / (mapSize.y / WORLD_UNITS_PER_SVG_UNIT),
  );

  const pan = new THREE.Vector3(
    center.x * WORLD_UNITS_PER_SVG_UNIT,
    -center.y * WORLD_UNITS_PER_SVG_UNIT,
    0,
  );
  clampPanVector(pan, mapSize);
  return { pan, zoom: readFramingZoom(shareOfMap, boundsList.length) };
}

/**
 * @param {number} shareOfMap
 * @param {number} selectionSize
 * @returns {number}
 */
export function readFramingZoom(shareOfMap, selectionSize) {
  if (shareOfMap <= 0) {
    return 1;
  }

  if (selectionSize === 1) {
    return THREE.MathUtils.clamp(
      SINGLE_CITY_SHARE_OF_MAP / shareOfMap,
      SINGLE_CITY_MIN_ZOOM,
      MAX_FRAMING_ZOOM,
    );
  }

  // Just above 1, so framing a group that spans the state keeps its pan instead of snapping home.
  return THREE.MathUtils.clamp(GROUP_SHARE_OF_MAP / shareOfMap, GROUP_MIN_ZOOM, MAX_FRAMING_ZOOM);
}

/**
 * Normalizes varied bounding box representations into THREE.Box2.
 * @param {any} input
 * @returns {THREE.Box2 | null}
 */
export function normalizeBox2(input) {
  if (!input) {
    return null;
  }
  if (input instanceof THREE.Box2) {
    return input.clone();
  }
  if (input instanceof THREE.Box3) {
    return new THREE.Box2(
      new THREE.Vector2(input.min.x, input.min.y),
      new THREE.Vector2(input.max.x, input.max.y),
    );
  }
  if (Array.isArray(input)) {
    if (input.length >= 4) {
      return new THREE.Box2(
        new THREE.Vector2(input[0], input[1]),
        new THREE.Vector2(input[2], input[3]),
      );
    }
    return null;
  }
  if ("min" in input && "max" in input && input.min && input.max) {
    return new THREE.Box2(
      new THREE.Vector2(input.min.x, input.min.y),
      new THREE.Vector2(input.max.x, input.max.y),
    );
  }
  if ("minX" in input && "maxX" in input && input.minX !== undefined && input.maxX !== undefined) {
    return new THREE.Box2(
      new THREE.Vector2(input.minX, input.minY),
      new THREE.Vector2(input.maxX, input.maxY),
    );
  }
  return null;
}

/**
 * Computes pan and zoom for a bounding box.
 * @param {THREE.Box2 | THREE.Box3 | any} boxInput
 * @param {THREE.Vector3} mapSize in world units
 * @param {{ isWorldUnits?: boolean }} [options]
 * @returns {{ pan: THREE.Vector3; zoom: number }}
 */
export function readBoxFraming(boxInput, mapSize, options = {}) {
  const box = normalizeBox2(boxInput);
  if (!box) {
    return { pan: new THREE.Vector3(0, 0, 0), zoom: 1 };
  }
  const center = box.getCenter(new THREE.Vector2());
  const size = box.getSize(new THREE.Vector2());

  let panX = center.x * WORLD_UNITS_PER_SVG_UNIT;
  let panY = -center.y * WORLD_UNITS_PER_SVG_UNIT;
  let shareOfMap = Math.max(
    size.x / (mapSize.x / WORLD_UNITS_PER_SVG_UNIT),
    size.y / (mapSize.y / WORLD_UNITS_PER_SVG_UNIT),
  );

  if (options.isWorldUnits) {
    panX = center.x;
    panY = center.y;
    shareOfMap = Math.max(size.x / mapSize.x, size.y / mapSize.y);
  }

  const pan = new THREE.Vector3(panX, panY, 0);
  clampPanVector(pan, mapSize);

  let zoom = 1;
  if (shareOfMap > 0 && shareOfMap < 0.92) {
    zoom = readFramingZoom(shareOfMap, 2);
  }
  return { pan, zoom };
}
