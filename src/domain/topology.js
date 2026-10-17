/**
 * @typedef {[number, number]} Point
 * @typedef {Point[]} Ring
 * @typedef {Ring[]} PolygonRings
 * @typedef {{ scale: [number, number], translate: [number, number] }} Transform
 * @typedef {{ type: string, id?: string, arcs: number[][] | number[][][] }} Geometry
 * @typedef {{ type: "Topology", transform?: Transform, objects: Record<string, { type: string, geometries: Geometry[] }>, arcs: Point[][] }} Topology
 * @typedef {{ valid: boolean, minArcUsage: number, maxArcUsage: number, emptyRingCount: number }} TopologyValidation
 */

/**
 * Decodes a quantized delta arc into absolute coordinate points.
 * @param {Point[]} arc
 * @param {Transform} [transform]
 * @returns {Point[]}
 */
export function decodeArc(arc, transform) {
  let currentX = 0;
  let currentY = 0;
  /** @type {Point[]} */
  const coordinates = [];

  for (const point of arc) {
    currentX += point[0];
    currentY += point[1];
    coordinates.push(applyTransform(currentX, currentY, transform));
  }

  return coordinates;
}

/**
 * Decodes all coordinate rings for a given geometry.
 * Handles both Polygon and MultiPolygon geometries.
 * @param {Geometry} geometry
 * @param {Point[][]} arcs
 * @param {Transform} [transform]
 * @returns {Ring[]}
 */
export function decodeRings(geometry, arcs, transform) {
  if (geometry.type === "Polygon") {
    const polygonArcs = /** @type {number[][]} */ (geometry.arcs);
    return decodePolygonArcs(polygonArcs, arcs, transform);
  }

  if (geometry.type === "MultiPolygon") {
    const multiArcs = /** @type {number[][][]} */ (geometry.arcs);
    /** @type {Ring[]} */
    const allRings = [];
    for (const polygonArcs of multiArcs) {
      allRings.push(...decodePolygonArcs(polygonArcs, arcs, transform));
    }
    return allRings;
  }

  return [];
}

/**
 * Maps each arc index to the list of geometry IDs that contain it.
 * @param {Topology} topology
 * @param {string} [collectionName]
 * @returns {Map<number, string[]>}
 */
export function readArcUsage(topology, collectionName = "municipalities") {
  const collection = topology.objects[collectionName];
  if (!collection) {
    return new Map();
  }

  /** @type {Map<number, string[]>} */
  const usageMap = new Map();

  for (const geometry of collection.geometries) {
    const id = geometry.id ?? "";
    const arcIndices = extractArcIndices(geometry);

    for (const index of arcIndices) {
      const existing = usageMap.get(index);
      if (existing) {
        if (!existing.includes(id)) {
          existing.push(id);
        }
        continue;
      }
      usageMap.set(index, [id]);
    }
  }

  return usageMap;
}

/**
 * Finds all arc indices shared by geometries belonging to different groups.
 * @param {Topology} topology
 * @param {(id: string) => string} groupOf
 * @param {string} [collectionName]
 * @returns {number[]}
 */
export function readSharedArcs(topology, groupOf, collectionName = "municipalities") {
  const usage = readArcUsage(topology, collectionName);
  /** @type {number[]} */
  const sharedArcs = [];

  for (const [arcIndex, ids] of usage.entries()) {
    if (ids.length !== 2) {
      continue;
    }
    const groupA = groupOf(ids[0]);
    const groupB = groupOf(ids[1]);
    if (groupA === "" || groupB === "") {
      continue;
    }
    if (groupA === groupB) {
      continue;
    }
    sharedArcs.push(arcIndex);
  }

  return sharedArcs.sort((a, b) => a - b);
}

/**
 * Validates topological constraints for DAD-04:
 * - every arc is used by 1 or 2 geometries;
 * - all geometries contain at least one non-empty ring.
 * @param {Topology} topology
 * @param {string} [collectionName]
 * @returns {TopologyValidation}
 */
export function validateTopology(topology, collectionName = "municipalities") {
  const usage = readArcUsage(topology, collectionName);
  const collection = topology.objects[collectionName];

  let minArcUsage = Number.POSITIVE_INFINITY;
  let maxArcUsage = 0;
  let emptyRingCount = 0;

  for (let index = 0; index < topology.arcs.length; index += 1) {
    const count = usage.get(index)?.length ?? 0;
    if (count < minArcUsage) {
      minArcUsage = count;
    }
    if (count > maxArcUsage) {
      maxArcUsage = count;
    }
  }

  if (collection) {
    for (const geometry of collection.geometries) {
      const rings = decodeRings(geometry, topology.arcs, topology.transform);
      if (rings.length === 0 || rings.some((ring) => ring.length < 3)) {
        emptyRingCount += 1;
      }
    }
  }

  const valid = minArcUsage >= 1 && maxArcUsage <= 2 && emptyRingCount === 0;

  return {
    valid,
    minArcUsage,
    maxArcUsage,
    emptyRingCount,
  };
}

/**
 * @param {number} x
 * @param {number} y
 * @param {Transform} [transform]
 * @returns {Point}
 */
function applyTransform(x, y, transform) {
  if (!transform) {
    return [x, y];
  }
  return [
    x * transform.scale[0] + transform.translate[0],
    y * transform.scale[1] + transform.translate[1],
  ];
}

/**
 * @param {number[][]} polygonArcs
 * @param {Point[][]} arcs
 * @param {Transform} [transform]
 * @returns {Ring[]}
 */
function decodePolygonArcs(polygonArcs, arcs, transform) {
  /** @type {Ring[]} */
  const rings = [];

  for (const ringIndices of polygonArcs) {
    /** @type {Point[]} */
    const ring = [];
    for (const index of ringIndices) {
      const arcPoints = resolveArcPoints(index, arcs, transform);
      appendPointsSkippingDuplicate(ring, arcPoints);
    }
    rings.push(ring);
  }

  return rings;
}

/**
 * @param {number} arcIndex
 * @param {Point[][]} arcs
 * @param {Transform} [transform]
 * @returns {Point[]}
 */
function resolveArcPoints(arcIndex, arcs, transform) {
  if (arcIndex >= 0) {
    return decodeArc(arcs[arcIndex], transform);
  }
  const positiveIndex = ~arcIndex;
  const decoded = decodeArc(arcs[positiveIndex], transform);
  return decoded.slice().reverse();
}

/**
 * @param {Point[]} destination
 * @param {Point[]} source
 */
function appendPointsSkippingDuplicate(destination, source) {
  const startIndex = destination.length > 0 ? 1 : 0;
  for (let index = startIndex; index < source.length; index += 1) {
    destination.push(source[index]);
  }
}

/**
 * @param {Geometry} geometry
 * @returns {number[]}
 */
function extractArcIndices(geometry) {
  /** @type {Set<number>} */
  const indices = new Set();

  if (geometry.type === "Polygon") {
    collectArcIndicesFromPolygon(/** @type {number[][]} */ (geometry.arcs), indices);
    return [...indices];
  }

  if (geometry.type === "MultiPolygon") {
    for (const polygon of /** @type {number[][][]} */ (geometry.arcs)) {
      collectArcIndicesFromPolygon(polygon, indices);
    }
    return [...indices];
  }

  return [];
}

/**
 * @param {number[][]} polygon
 * @param {Set<number>} indices
 */
function collectArcIndicesFromPolygon(polygon, indices) {
  for (const ring of polygon) {
    for (const index of ring) {
      const positive = index >= 0 ? index : ~index;
      indices.add(positive);
    }
  }
}
