import * as THREE from "three";
import { groupOf } from "../domain/territory.js";
import { decodeArc, readArcUsage, readSharedArcs } from "../domain/topology.js";
import { BORDER_OFFSET, REGION_BORDER_OPACITY } from "./constants.js";
import { readTopHeight } from "./frame-loop.js";

const REGION_LEVEL = "region";
const GOVERNMENT_REGION_LEVEL = "governmentRegion";
const ADMINISTRATIVE_REGION_LEVEL = "administrativeRegion";
const LIMIT_OFFSET = BORDER_OFFSET * 2;
const VISIBLE_BORDER_OPACITY = 1;

/**
 * @typedef {import("../domain/topology.js").Topology} Topology
 * @typedef {import("../domain/topology.js").Point} Point
 * @typedef {THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>} LimitLines
 */

/**
 * The region limits as one line object, hidden until the region level shows it.
 * @returns {LimitLines}
 */
export function createLimitLines() {
  const limitLines = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ transparent: true }),
  );
  limitLines.frustumCulled = false;
  limitLines.visible = false;
  return limitLines;
}

/**
 * Computes the shared boundary arcs separating distinct territorial groups.
 * @param {Topology} topology
 * @param {string} level
 * @param {(level: string, code: string) => string} [groupOfFn]
 * @returns {number[]}
 */
export function computeLimitArcs(topology, level, groupOfFn = groupOf) {
  if (!topology) {
    return [];
  }
  if (level === "municipality") {
    return [];
  }
  return readSharedArcs(topology, (code) => groupOfFn(level, code));
}

/**
 * Decodes the limit arcs into segments in the units of the topology, centered on the map center
 * like the municipality outlines. Every segment keeps the two municipalities its arc separates, so
 * it can sit on the taller of them. An arc of a municipality the map does not draw is skipped.
 * @param {{
 *   topology: Topology;
 *   limitArcs: readonly number[];
 *   indexByCode: Map<string, number>;
 *   mapCenter: THREE.Vector2;
 * }} options
 * @returns {THREE.BufferGeometry}
 */
export function buildLimitGeometry({ topology, limitArcs, indexByCode, mapCenter }) {
  const arcUsage = readArcUsage(topology);
  /** @type {number[]} */
  const coordinates = [];
  /** @type {number[]} */
  const ownerPairs = [];
  let arcCount = 0;

  for (const arcIndex of limitArcs) {
    const owners = readArcOwners(arcUsage.get(arcIndex) ?? [], indexByCode);
    if (!owners) {
      continue;
    }
    const points = decodeArc(topology.arcs[arcIndex], topology.transform);
    pushArcSegments({ points, owners, mapCenter }, coordinates, ownerPairs);
    arcCount += 1;
  }

  return createLimitGeometry(coordinates, ownerPairs, arcCount);
}

/**
 * Sets every segment on the taller of its two municipalities, above the municipal borders. Only the
 * heights move it, never the lift.
 * @param {LimitLines | THREE.LineSegments} limitLines
 * @param {Float32Array} heightCurrent one height scale per municipality
 */
export function updateLimitHeights(limitLines, heightCurrent) {
  const positionAttribute = limitLines.geometry.attributes.position;
  const ownerPairs = limitLines.geometry.userData.ownerPairs;
  if (!positionAttribute) {
    return;
  }
  if (!ownerPairs) {
    return;
  }

  const positions = positionAttribute.array;
  for (let segmentIndex = 0; segmentIndex < ownerPairs.length / 2; segmentIndex += 1) {
    const firstHeight = readTopHeight(heightCurrent[ownerPairs[segmentIndex * 2]]);
    const secondHeight = readTopHeight(heightCurrent[ownerPairs[segmentIndex * 2 + 1]]);
    const height = Math.max(firstHeight, secondHeight) + LIMIT_OFFSET;
    positions[segmentIndex * 6 + 2] = height;
    positions[segmentIndex * 6 + 5] = height;
  }
  positionAttribute.needsUpdate = true;
}

/**
 * Shows the limits and fades the municipal borders at region and governmentRegion levels, so the
 * groups read at a glance; at municipality level the limits hide and the borders come back.
 * @param {{ borders: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>; limitLines: LimitLines }} lines
 * @param {string} level
 */
export function applyLimitStyle({ borders, limitLines }, level) {
  const { isLimitVisible, borderOpacity } = readLimitStyle(level);
  limitLines.visible = isLimitVisible;
  borders.material.opacity = borderOpacity;
  borders.material.transparent = borderOpacity < VISIBLE_BORDER_OPACITY;
  borders.material.needsUpdate = true;
}

/**
 * @param {string} level
 * @returns {{ isLimitVisible: boolean; borderOpacity: number }}
 */
export function readLimitStyle(level) {
  if (
    level === REGION_LEVEL ||
    level === ADMINISTRATIVE_REGION_LEVEL ||
    level === GOVERNMENT_REGION_LEVEL
  ) {
    return { isLimitVisible: true, borderOpacity: REGION_BORDER_OPACITY };
  }
  return { isLimitVisible: false, borderOpacity: VISIBLE_BORDER_OPACITY };
}

/**
 * The two municipality indexes of an arc. A limit arc separates two municipalities; an arc with one
 * owner keeps it on both sides.
 * @param {string[]} codes
 * @param {Map<string, number>} indexByCode
 * @returns {[number, number] | null}
 */
function readArcOwners(codes, indexByCode) {
  const firstIndex = indexByCode.get(codes[0]);
  const secondIndex = indexByCode.get(codes[codes.length - 1]);
  if (firstIndex === undefined) {
    return null;
  }
  if (secondIndex === undefined) {
    return null;
  }
  return [firstIndex, secondIndex];
}

/**
 * @param {{ points: Point[]; owners: [number, number]; mapCenter: THREE.Vector2 }} arc
 * @param {number[]} coordinates
 * @param {number[]} ownerPairs
 */
function pushArcSegments({ points, owners, mapCenter }, coordinates, ownerPairs) {
  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
    const [startX, startY] = points[pointIndex - 1];
    const [endX, endY] = points[pointIndex];
    if (startX === endX && startY === endY) {
      continue;
    }
    coordinates.push(
      startX - mapCenter.x,
      startY - mapCenter.y,
      endX - mapCenter.x,
      endY - mapCenter.y,
    );
    ownerPairs.push(owners[0], owners[1]);
  }
}

/**
 * @param {number[]} coordinates two points per segment, x and y
 * @param {number[]} ownerPairs two municipality indexes per segment
 * @param {number} arcCount
 * @returns {THREE.BufferGeometry}
 */
function createLimitGeometry(coordinates, ownerPairs, arcCount) {
  const segmentCount = ownerPairs.length / 2;
  const positions = new Float32Array(segmentCount * 6);
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    positions[segmentIndex * 6] = coordinates[segmentIndex * 4];
    positions[segmentIndex * 6 + 1] = coordinates[segmentIndex * 4 + 1];
    positions[segmentIndex * 6 + 3] = coordinates[segmentIndex * 4 + 2];
    positions[segmentIndex * 6 + 4] = coordinates[segmentIndex * 4 + 3];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.userData.ownerPairs = Uint16Array.from(ownerPairs);
  geometry.userData.arcCount = arcCount;
  return geometry;
}
