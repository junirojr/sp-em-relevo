import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeArc, validateTopology } from "../../src/domain/topology.js";
import { CANVAS_HEIGHT, CANVAS_WIDTH, projectTopology } from "./project.js";

/**
 * @typedef {import("../../src/domain/topology.js").Topology} Topology
 * @typedef {import("../../src/domain/topology.js").Point} Point
 */

const TOLERANCE = 1e-6;
const LEFT_ARC = 5;

test("DAD-04 R3 projected mesh fits 288000 by 180000, fills the limiting side and is centered", () => {
  const bounds = readProjectedBounds(projectTopology(createTwoCellTopology()));

  assertClose(bounds.minX, 0);
  assertClose(bounds.maxX, CANVAS_WIDTH);
  assert.ok(bounds.minY > 0);
  assert.ok(bounds.maxY < CANVAS_HEIGHT);
  assertClose((bounds.minY + bounds.maxY) / 2, CANVAS_HEIGHT / 2);
});

test("DAD-04 R3 Y grows downward: the northern edge gets the smaller Y", () => {
  const projected = projectTopology(createTwoCellTopology());
  const leftEdge = decodeArc(projected.arcs[LEFT_ARC], projected.transform);
  const [startsAtNorth, endsAtSouth] = [leftEdge[0], leftEdge[leftEdge.length - 1]];

  assert.ok(startsAtNorth[1] < endsAtSouth[1]);
});

test("DAD-04 R3 east-west distances shrink by the cosine of the mean latitude", () => {
  const bounds = readProjectedBounds(projectTopology(createTwoCellTopology()));
  const meanLatitudeRadians = (-23.5 * Math.PI) / 180;
  const expectedRatio = (2 * Math.cos(meanLatitudeRadians)) / 1;

  assertClose((bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY), expectedRatio);
});

test("DAD-04 R3 projection keeps arcs integer, geometries untouched and the topology valid", () => {
  const source = createTwoCellTopology();
  const projected = projectTopology(source);
  const validation = validateTopology(projected);

  assert.equal(projected.arcs.length, source.arcs.length);
  assert.deepEqual(projected.objects, source.objects);
  assert.ok(projected.arcs.flat(2).every(Number.isInteger));
  assert.equal(validation.valid, true);
  assert.equal(validation.maxArcUsage, 2);
});

test("DAD-04 R3 projection rejects a topology without quantization transform", () => {
  const unquantized = { ...createTwoCellTopology(), transform: undefined };

  assert.throws(() => projectTopology(unquantized), /transform/);
});

/**
 * Two cells side by side between longitudes -50 and -48 and latitudes -24 and -23,
 * sharing the middle edge (arc 6). Grid step: 0.01 degree.
 * @returns {Topology}
 */
function createTwoCellTopology() {
  return {
    type: "Topology",
    transform: { scale: [0.01, 0.01], translate: [-50, -24] },
    objects: {
      municipalities: {
        type: "GeometryCollection",
        geometries: [
          { type: "Polygon", id: "3500101", arcs: [[0, 6, 4, 5]] },
          { type: "Polygon", id: "3500102", arcs: [[1, 2, 3, -7]] },
        ],
      },
    },
    arcs: [
      [
        [0, 0],
        [100, 0],
      ],
      [
        [100, 0],
        [100, 0],
      ],
      [
        [200, 0],
        [0, 100],
      ],
      [
        [200, 100],
        [-100, 0],
      ],
      [
        [100, 100],
        [-100, 0],
      ],
      [
        [0, 100],
        [0, -100],
      ],
      [
        [100, 0],
        [0, 100],
      ],
    ],
  };
}

/**
 * @param {Topology} topology
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
function readProjectedBounds(topology) {
  /** @type {Point[]} */
  const points = topology.arcs.flatMap((arc) => decodeArc(arc, topology.transform));
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/**
 * @param {number} actual
 * @param {number} expected
 */
function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < TOLERANCE, `${actual} is not close to ${expected}`);
}
