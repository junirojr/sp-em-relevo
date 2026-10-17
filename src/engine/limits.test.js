import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BORDER_OFFSET, PLATE_DEPTH, REGION_BORDER_OPACITY } from "./constants.js";
import {
  applyLimitStyle,
  buildLimitGeometry,
  createLimitLines,
  readLimitStyle,
  updateLimitHeights,
} from "./limits.js";

/**
 * Three adjacent squares in a line:
 * A (code 1): [0, 0] to [10, 10]
 * B (code 2): [10, 0] to [20, 10]
 * C (code 3): [20, 0] to [30, 10]
 *
 * Arc 0: shared between A and B, from (10, 0) to (10, 10)
 * Arc 1: shared between B and C, from (20, 0) to (20, 10)
 */
/**
 * @returns {import("../domain/topology.js").Topology}
 */
function createTopologyFixture() {
  return {
    type: /** @type {const} */ ("Topology"),
    transform: { scale: [1, 1], translate: [0, 0] },
    arcs: [
      [
        [10, 0],
        [0, 10],
      ],
      [
        [20, 0],
        [0, 10],
      ],
      [
        [0, 0],
        [0, 10],
        [10, 0],
      ],
    ],
    objects: {
      municipalities: {
        type: /** @type {const} */ ("GeometryCollection"),
        geometries: [
          { type: "Polygon", arcs: [[0, 2]], id: "35001" },
          { type: "Polygon", arcs: [[-1, 1]], id: "35002" },
          { type: "Polygon", arcs: [[-2]], id: "35003" },
        ],
      },
    },
  };
}

test("NIV-07 createLimitLines creates hidden non-frustum-culled LineSegments", () => {
  const lines = createLimitLines();
  assert.equal(lines.visible, false);
  assert.equal(lines.frustumCulled, false);
  assert.ok(lines instanceof THREE.LineSegments);
});

test("NIV-07 buildLimitGeometry decodes limit arcs into centered segments with owner pairs", () => {
  const topology = createTopologyFixture();
  const indexByCode = new Map([
    ["35001", 0],
    ["35002", 1],
    ["35003", 2],
  ]);
  const mapCenter = new THREE.Vector2(15, 5);

  const geometry = buildLimitGeometry({
    topology,
    limitArcs: [0, 1],
    indexByCode,
    mapCenter,
  });

  const positions = geometry.attributes.position.array;
  assert.equal(positions.length, 12);
  assert.equal(positions[0], -5);
  assert.equal(positions[1], -5);
  assert.equal(positions[3], -5);
  assert.equal(positions[4], 5);
  assert.equal(positions[6], 5);
  assert.equal(positions[7], -5);
  assert.equal(positions[9], 5);
  assert.equal(positions[10], 5);

  const owners = geometry.userData.ownerPairs;
  assert.deepEqual(Array.from(owners), [0, 1, 1, 2]);
  assert.equal(geometry.userData.arcCount, 2);
});

test("NIV-07 updateLimitHeights places segments at the taller municipality height plus offset", () => {
  const lines = createLimitLines();
  const positions = new Float32Array(12);
  lines.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  lines.geometry.userData.ownerPairs = new Uint16Array([0, 1, 1, 2]);

  const heightCurrent = new Float32Array([1.0, 2.5, 0.5]);
  updateLimitHeights(lines, heightCurrent);

  const expectedHeightFirst = PLATE_DEPTH * 2.5;
  const expectedFirstSegmentZ = expectedHeightFirst + BORDER_OFFSET * 2;
  assert.ok(Math.abs(positions[2] - expectedFirstSegmentZ) < 1e-4);
  assert.ok(Math.abs(positions[5] - expectedFirstSegmentZ) < 1e-4);

  assert.ok(Math.abs(positions[8] - expectedFirstSegmentZ) < 1e-4);
  assert.ok(Math.abs(positions[11] - expectedFirstSegmentZ) < 1e-4);
});

test("NIV-07 readLimitStyle returns visible limits and 0.3 border opacity only for region level", () => {
  const regionStyle = readLimitStyle("region");
  assert.equal(regionStyle.isLimitVisible, true);
  assert.equal(regionStyle.borderOpacity, REGION_BORDER_OPACITY);

  const muniStyle = readLimitStyle("municipality");
  assert.equal(muniStyle.isLimitVisible, false);
  assert.equal(muniStyle.borderOpacity, 1);
});

test("NIV-07 applyLimitStyle updates visibility, opacity and transparency of borders", () => {
  const borders = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  const limitLines = createLimitLines();

  applyLimitStyle({ borders, limitLines }, "region");
  assert.equal(limitLines.visible, true);
  assert.equal(borders.material.opacity, 0.3);
  assert.equal(borders.material.transparent, true);

  applyLimitStyle({ borders, limitLines }, "municipality");
  assert.equal(limitLines.visible, false);
  assert.equal(borders.material.opacity, 1);
  assert.equal(borders.material.transparent, false);
});
