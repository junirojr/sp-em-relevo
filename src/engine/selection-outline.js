import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { decodeArc, readArcUsage, readSharedArcs } from "../domain/topology.js";
import { BORDER_OFFSET } from "./constants.js";
import { readTopHeight } from "./frame-loop.js";

export const OUTLINE_DARK_TONE = "#000000";
export const OUTLINE_LIGHT_TONE = "#ffffff";
export const OUTLINE_INNER_WIDTH = 3;
export const OUTLINE_OUTER_WIDTH = 5;
export const SELECTION_OUTLINE_OFFSET = BORDER_OFFSET * 2;
export const MIN_CONTRAST_RATIO = 3.0;

/**
 * @typedef {import("../domain/topology.js").Topology} Topology
 * @typedef {import("./geometry.js").MapMunicipality} MapMunicipality
 *
 * @typedef {{
 *   group: THREE.Group;
 *   outer: LineSegments2;
 *   inner: LineSegments2;
 *   geometry: LineSegmentsGeometry;
 *   outerMaterial: LineMaterial;
 *   innerMaterial: LineMaterial;
 *   visible: boolean;
 *   setVisible: (visible: boolean) => void;
 *   updateGeometry: (geometry: LineSegmentsGeometry) => void;
 *   updateHeights: (heightCurrent: Float32Array) => void;
 *   setResolution: (width: number, height: number) => void;
 *   dispose: () => void;
 * }} SelectionOutline
 */

/**
 * Creates the strong dual-tone selection outline object using LineSegments2 and LineMaterial (ELE-12, ELE-13).
 * Outer line uses the dark tone (5 px CSS); inner line uses the light tone (3 px CSS).
 * Both render without depth test so the contour remains visible behind taller neighbors (ELE-14).
 *
 * @param {{
 *   darkTone?: string;
 *   lightTone?: string;
 *   outerWidth?: number;
 *   innerWidth?: number;
 * }} [options]
 * @returns {SelectionOutline}
 */
export function createSelectionOutline(options = {}) {
  const darkTone = options.darkTone || OUTLINE_DARK_TONE;
  const lightTone = options.lightTone || OUTLINE_LIGHT_TONE;
  const outerWidth = options.outerWidth || OUTLINE_OUTER_WIDTH;
  const innerWidth = options.innerWidth || OUTLINE_INNER_WIDTH;

  const geometry = new LineSegmentsGeometry();

  const outerMaterial = new LineMaterial({
    color: new THREE.Color(darkTone).getHex(),
    linewidth: outerWidth,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });

  const innerMaterial = new LineMaterial({
    color: new THREE.Color(lightTone).getHex(),
    linewidth: innerWidth,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });

  const outer = new LineSegments2(geometry, outerMaterial);
  outer.renderOrder = 998;
  outer.frustumCulled = false;

  const inner = new LineSegments2(geometry, innerMaterial);
  inner.renderOrder = 999;
  inner.frustumCulled = false;

  const group = new THREE.Group();
  group.name = "selectionOutline";
  group.add(outer, inner);
  group.visible = false;

  /** @type {SelectionOutline} */
  const outline = {
    group,
    outer,
    inner,
    geometry,
    outerMaterial,
    innerMaterial,
    get visible() {
      return group.visible;
    },
    setVisible(visible) {
      group.visible = visible;
      outer.visible = visible;
      inner.visible = visible;
    },
    updateGeometry(nextGeometry) {
      if (outline.geometry && outline.geometry !== nextGeometry) {
        outline.geometry.dispose();
      }
      outline.geometry = nextGeometry;
      outer.geometry = nextGeometry;
      inner.geometry = nextGeometry;
    },
    updateHeights(heightCurrent) {
      updateSelectionOutlineHeights(outline, heightCurrent);
    },
    setResolution(width, height) {
      const safeWidth = Math.max(1, width);
      const safeHeight = Math.max(1, height);
      outerMaterial.resolution.set(safeWidth, safeHeight);
      innerMaterial.resolution.set(safeWidth, safeHeight);
    },
    dispose() {
      group.remove(outer, inner);
      outline.geometry.dispose();
      outerMaterial.dispose();
      innerMaterial.dispose();
    },
  };

  return outline;
}

/**
 * Computes perimeter arc indices for the selected units set using readSharedArcs (ELE-14).
 * Internal edges between two selected units are excluded because groupOf returns the same
 * group for both, causing readSharedArcs to skip them.
 * Outer state boundary arcs (used by exactly one municipality in the selection) are included.
 *
 * @param {Topology} topology
 * @param {readonly string[]} selectedCodes
 * @returns {number[]}
 */
export function computeSelectionArcs(topology, selectedCodes) {
  if (!topology) {
    return [];
  }
  const selectedSet = new Set(selectedCodes);
  if (selectedSet.size === 0) {
    return [];
  }

  const groupOfFn = (id) => {
    if (selectedSet.has(id)) {
      return "selected";
    }
    return "outside";
  };

  const sharedArcs = readSharedArcs(topology, groupOfFn);
  const arcUsage = readArcUsage(topology);
  /** @type {number[]} */
  const perimeterArcs = [...sharedArcs];

  for (const [arcIndex, ids] of arcUsage.entries()) {
    if (ids.length === 1 && selectedSet.has(ids[0])) {
      perimeterArcs.push(arcIndex);
    }
  }

  perimeterArcs.sort((a, b) => a - b);
  return perimeterArcs;
}

/**
 * Decodes the selection perimeter arcs into 3D segments centered on mapCenter.
 * Each segment records its selected municipality owner so heights follow that block (ELE-14).
 *
 * @param {{
 *   topology?: Topology;
 *   selectedCodes: readonly string[];
 *   municipalities?: Array<{ code: string; outline: Float32Array }>;
 *   indexByCode: Map<string, number>;
 *   mapCenter: THREE.Vector2;
 * }} options
 * @returns {LineSegmentsGeometry | null}
 */
export function buildSelectionGeometry({
  topology,
  selectedCodes,
  municipalities = [],
  indexByCode,
  mapCenter,
}) {
  const selectedSet = new Set(selectedCodes);
  if (selectedSet.size === 0) {
    return null;
  }

  if (topology) {
    return buildGeometryFromTopology({
      topology,
      selectedSet,
      selectedCodes,
      indexByCode,
      mapCenter,
    });
  }

  return buildGeometryFromOutlines({
    selectedCodes,
    municipalities,
    indexByCode,
  });
}

/**
 * @param {{
 *   topology: Topology;
 *   selectedSet: Set<string>;
 *   selectedCodes: readonly string[];
 *   indexByCode: Map<string, number>;
 *   mapCenter: THREE.Vector2;
 * }} options
 * @returns {LineSegmentsGeometry | null}
 */
function buildGeometryFromTopology({
  topology,
  selectedSet,
  selectedCodes,
  indexByCode,
  mapCenter,
}) {
  const selectionArcs = computeSelectionArcs(topology, selectedCodes);
  if (selectionArcs.length === 0) {
    return null;
  }

  const arcUsage = readArcUsage(topology);
  /** @type {number[]} */
  const coordinates = [];
  /** @type {number[]} */
  const owners = [];

  for (const arcIndex of selectionArcs) {
    const ids = arcUsage.get(arcIndex);
    if (!ids) {
      continue;
    }
    const ownerIndex = resolveSelectedOwner(ids, selectedSet, indexByCode);
    if (ownerIndex === undefined) {
      continue;
    }
    const points = decodeArc(topology.arcs[arcIndex], topology.transform);
    pushArcSegments(points, ownerIndex, mapCenter, coordinates, owners);
  }

  if (owners.length === 0) {
    return null;
  }

  return createSegmentsGeometry(coordinates, owners);
}

/**
 * @param {string[]} ids
 * @param {Set<string>} selectedSet
 * @param {Map<string, number>} indexByCode
 * @returns {number | undefined}
 */
function resolveSelectedOwner(ids, selectedSet, indexByCode) {
  if (ids.length === 1) {
    if (selectedSet.has(ids[0])) {
      return indexByCode.get(ids[0]);
    }
    return undefined;
  }
  if (selectedSet.has(ids[0])) {
    return indexByCode.get(ids[0]);
  }
  if (selectedSet.has(ids[1])) {
    return indexByCode.get(ids[1]);
  }
  return undefined;
}

/**
 * @param {import("../domain/topology.js").Point[]} points
 * @param {number} ownerIndex
 * @param {THREE.Vector2} mapCenter
 * @param {number[]} coordinates
 * @param {number[]} owners
 */
function pushArcSegments(points, ownerIndex, mapCenter, coordinates, owners) {
  for (let i = 1; i < points.length; i += 1) {
    const [startX, startY] = points[i - 1];
    const [endX, endY] = points[i];
    if (startX === endX && startY === endY) {
      continue;
    }
    coordinates.push(
      startX - mapCenter.x,
      startY - mapCenter.y,
      0,
      endX - mapCenter.x,
      endY - mapCenter.y,
      0,
    );
    owners.push(ownerIndex);
  }
}

/**
 * @param {{
 *   selectedCodes: readonly string[];
 *   municipalities: Array<{ code: string; outline: Float32Array }>;
 *   indexByCode: Map<string, number>;
 * }} options
 * @returns {LineSegmentsGeometry | null}
 */
function buildGeometryFromOutlines({ selectedCodes, municipalities, indexByCode }) {
  /** @type {Array<{ startX: number; startY: number; endX: number; endY: number; ownerIndex: number }>} */
  const rawSegments = [];

  for (const code of selectedCodes) {
    const index = indexByCode.get(code);
    if (index === undefined) {
      continue;
    }
    const outline = municipalities[index]?.outline;
    if (!outline) {
      continue;
    }
    for (let readIndex = 0; readIndex < outline.length; readIndex += 4) {
      rawSegments.push({
        startX: outline[readIndex],
        startY: outline[readIndex + 1],
        endX: outline[readIndex + 2],
        endY: outline[readIndex + 3],
        ownerIndex: index,
      });
    }
  }

  if (rawSegments.length === 0) {
    return null;
  }

  const perimeterSegments = filterPerimeterSegments(rawSegments);
  if (perimeterSegments.length === 0) {
    return null;
  }

  /** @type {number[]} */
  const coordinates = [];
  /** @type {number[]} */
  const owners = [];

  for (const segment of perimeterSegments) {
    coordinates.push(
      segment.startX,
      segment.startY,
      0,
      segment.endX,
      segment.endY,
      0,
    );
    owners.push(segment.ownerIndex);
  }

  return createSegmentsGeometry(coordinates, owners);
}

/**
 * @param {Array<{ startX: number; startY: number; endX: number; endY: number; ownerIndex: number }>} segments
 * @returns {Array<{ startX: number; startY: number; endX: number; endY: number; ownerIndex: number }>}
 */
function filterPerimeterSegments(segments) {
  if (segments.length <= 1) {
    return segments;
  }
  /** @type {Map<string, number>} */
  const segmentKeyCount = new Map();
  for (const seg of segments) {
    const key = makeCanonicalSegmentKey(seg.startX, seg.startY, seg.endX, seg.endY);
    const count = segmentKeyCount.get(key) || 0;
    segmentKeyCount.set(key, count + 1);
  }

  return segments.filter((seg) => {
    const key = makeCanonicalSegmentKey(seg.startX, seg.startY, seg.endX, seg.endY);
    return segmentKeyCount.get(key) === 1;
  });
}

/**
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {string}
 */
function makeCanonicalSegmentKey(x1, y1, x2, y2) {
  const p1 = `${x1.toFixed(3)},${y1.toFixed(3)}`;
  const p2 = `${x2.toFixed(3)},${y2.toFixed(3)}`;
  if (p1 < p2) {
    return `${p1}_${p2}`;
  }
  return `${p2}_${p1}`;
}

/**
 * @param {number[]} coordinates
 * @param {number[]} owners
 * @returns {LineSegmentsGeometry}
 */
function createSegmentsGeometry(coordinates, owners) {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(coordinates));
  geometry.userData.owners = Uint16Array.from(owners);
  geometry.userData.segmentCount = owners.length;
  return geometry;
}

/**
 * Updates the heights of the selection outline segments to match the current height
 * of each owning municipality plus SELECTION_OUTLINE_OFFSET (ELE-14).
 *
 * @param {SelectionOutline} selectionOutline
 * @param {Float32Array} heightCurrent
 */
export function updateSelectionOutlineHeights(selectionOutline, heightCurrent) {
  const geometry = selectionOutline.geometry;
  if (!geometry) {
    return;
  }
  const owners = geometry.userData?.owners;
  if (!owners) {
    return;
  }
  const instanceStart = geometry.attributes?.instanceStart;
  if (!instanceStart?.data) {
    return;
  }
  const positions = instanceStart.data.array;
  const segmentCount = owners.length;

  for (let s = 0; s < segmentCount; s += 1) {
    const ownerIndex = owners[s];
    const topHeight = readTopHeight(heightCurrent[ownerIndex]);
    const height = topHeight + SELECTION_OUTLINE_OFFSET;
    positions[s * 6 + 2] = height;
    positions[s * 6 + 5] = height;
  }
  instanceStart.data.needsUpdate = true;
}

/**
 * Computes standard WCAG 2.x relative luminance for an sRGB hex color.
 *
 * @param {string} hex
 * @returns {number}
 */
export function computeRelativeLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  const toLinear = (c) => {
    if (c <= 0.04045) {
      return c / 12.92;
    }
    return Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Computes standard visual contrast ratio between two hex colors (ELE-13).
 *
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number}
 */
export function computeContrastRatio(hexA, hexB) {
  const lumA = computeRelativeLuminance(hexA);
  const lumB = computeRelativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Verifies that for the given color, at least one of the dual outline tones
 * achieves visual contrast >= 3:1 (ELE-13).
 *
 * @param {string} color
 * @param {string} [darkTone]
 * @param {string} [lightTone]
 * @returns {boolean}
 */
export function satisfiesOutlineContrast(
  color,
  darkTone = OUTLINE_DARK_TONE,
  lightTone = OUTLINE_LIGHT_TONE,
) {
  const contrastDark = computeContrastRatio(color, darkTone);
  const contrastLight = computeContrastRatio(color, lightTone);
  const maxContrast = Math.max(contrastDark, contrastLight);
  return maxContrast >= MIN_CONTRAST_RATIO;
}

/**
 * @param {string} hex
 * @returns {{ r: number; g: number; b: number }}
 */
function parseHex(hex) {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    const r = Number.parseInt(clean[0] + clean[0], 16) / 255;
    const g = Number.parseInt(clean[1] + clean[1], 16) / 255;
    const b = Number.parseInt(clean[2] + clean[2], 16) / 255;
    return { r, g, b };
  }
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return { r, g, b };
}
