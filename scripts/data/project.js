/**
 * R3 projection of the IBGE mesh: equirectangular, with east-west distances multiplied by the
 * cosine of the state's mean latitude, fitted and centered inside 288000 by 180000, with Y
 * growing downward like the legacy SVG. No extra simplification: the IBGE quality is the
 * simplification.
 *
 * The projection is affine on each axis, so the quantized integer grid of the source survives
 * untouched: only the transform changes and the Y axis flips. Shared arcs stay shared.
 *
 * @typedef {import("../../src/domain/topology.js").Topology} Topology
 * @typedef {import("../../src/domain/topology.js").Transform} Transform
 * @typedef {import("../../src/domain/topology.js").Point} Point
 * @typedef {{ minX: number, maxX: number, minY: number, maxY: number }} GridBounds
 * @typedef {{ eastWestFactor: number, unitsPerDegree: number, offsetX: number, offsetY: number }} CanvasFit
 */

export const CANVAS_WIDTH = 288000;
export const CANVAS_HEIGHT = 180000;

/**
 * Projects a quantized TopoJSON in longitude and latitude degrees onto the canvas.
 * @param {Topology} topology Quantized topology (with transform), coordinates in degrees.
 * @returns {Topology} Same objects; arcs and transform in canvas units, Y downward.
 */
export function projectTopology(topology) {
  const { transform } = topology;
  if (!transform) {
    throw new Error("projectTopology expects a quantized topology with a transform");
  }
  const grid = readGridBounds(topology.arcs);
  const fit = fitToCanvas(grid, transform);
  return {
    type: "Topology",
    transform: createCanvasTransform(grid, transform, fit),
    objects: topology.objects,
    arcs: topology.arcs.map((arc) => flipArcVertically(arc, grid.maxY)),
  };
}

/**
 * Bounds of the absolute quantized positions of every arc.
 * @param {Point[][]} arcs Delta-encoded quantized arcs.
 * @returns {GridBounds}
 */
function readGridBounds(arcs) {
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const arc of arcs) {
    includeArc(bounds, arc);
  }
  return bounds;
}

/**
 * Scale (canvas units per degree of latitude) and centering offsets of the R3 fit.
 * @param {GridBounds} grid
 * @param {Transform} transform
 * @returns {CanvasFit}
 */
function fitToCanvas(grid, transform) {
  const west = grid.minX * transform.scale[0] + transform.translate[0];
  const east = grid.maxX * transform.scale[0] + transform.translate[0];
  const south = grid.minY * transform.scale[1] + transform.translate[1];
  const north = grid.maxY * transform.scale[1] + transform.translate[1];
  const eastWestFactor = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const width = (east - west) * eastWestFactor;
  const height = north - south;
  if (width <= 0 || height <= 0) {
    throw new Error("projectTopology expects a mesh with a non-empty extent");
  }
  const unitsPerDegree = Math.min(CANVAS_WIDTH / width, CANVAS_HEIGHT / height);
  return {
    eastWestFactor,
    unitsPerDegree,
    offsetX: (CANVAS_WIDTH - width * unitsPerDegree) / 2,
    offsetY: (CANVAS_HEIGHT - height * unitsPerDegree) / 2,
  };
}

/**
 * Maps a quantized position to canvas units. X keeps the source grid; Y is read from the
 * flipped grid (maxY - y), so the northern edge sits at offsetY.
 * @param {GridBounds} grid
 * @param {Transform} transform
 * @param {CanvasFit} fit
 * @returns {Transform}
 */
function createCanvasTransform(grid, transform, fit) {
  const scaleX = transform.scale[0] * fit.eastWestFactor * fit.unitsPerDegree;
  const scaleY = transform.scale[1] * fit.unitsPerDegree;
  return {
    scale: [scaleX, scaleY],
    translate: [fit.offsetX - grid.minX * scaleX, fit.offsetY],
  };
}

/**
 * @param {Point[]} arc Delta-encoded quantized arc.
 * @param {number} maxY Largest quantized Y of the whole mesh.
 * @returns {Point[]}
 */
function flipArcVertically(arc, maxY) {
  const [[startX, startY], ...deltas] = arc;
  /** @type {Point} */
  const start = [startX, maxY - startY];
  // 0 - dy instead of -dy keeps a zero delta as +0, so the JSON never carries -0.
  const flippedDeltas = deltas.map(([dx, dy]) => /** @type {Point} */ ([dx, 0 - dy]));
  return [start, ...flippedDeltas];
}

/**
 * @param {GridBounds} bounds Mutated to include every absolute position of the arc.
 * @param {Point[]} arc
 */
function includeArc(bounds, arc) {
  let x = 0;
  let y = 0;
  for (const [dx, dy] of arc) {
    x += dx;
    y += dy;
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
}
