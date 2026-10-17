import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import {
  BORDER_OFFSET,
  FRAME_SAMPLE_SIZE,
  HEIGHT_EASING_PER_FRAME,
  LIFT_DURATION_MS,
  PLATE_DEPTH,
  RAISE_LIFT,
} from "./constants.js";
import {
  buildIndexByCode,
  createMapMotion,
  readElapsed,
  readMedianSample,
  readRaisedIndexes,
  readRaisedUnitIndexes,
  recordFrameSample,
  retargetLifts,
  stepCamera,
  stepHeights,
  stepLifts,
  updateLineHeights,
} from "./frame-loop.js";
import { buildMunicipalities, buildOwnedLines } from "./geometry.js";

const TINY_TOPOLOGY_URL = new URL("../domain/fixtures/tiny.topo.json", import.meta.url);

async function buildTinyMotion() {
  const topology = JSON.parse(await readFile(TINY_TOPOLOGY_URL, "utf8"));
  const { municipalities, plate } = buildMunicipalities(topology);
  return { municipalities, plate, motion: createMapMotion(plate, municipalities) };
}

/**
 * @param {THREE.BatchedMesh} plate
 * @param {number} instanceId
 */
function readPlacement(plate, instanceId) {
  const matrix = plate.getMatrixAt(instanceId, new THREE.Matrix4());
  return {
    lift: new THREE.Vector3().setFromMatrixPosition(matrix).z,
    heightScale: new THREE.Vector3().setFromMatrixScale(matrix).z,
  };
}

/**
 * @param {number} actual
 * @param {number} expected
 */
function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-4, `expected ${expected}, got ${actual}`);
}

/**
 * @param {{ pointed: number | null; selected: number[]; isLiftEnabled: { pointed: boolean; selected: boolean } }} raise
 */
function buildRaise({ pointed, selected, isLiftEnabled }) {
  return { pointed, selected: new Set(selected), isLiftEnabled };
}

test("BAS-04 stepHeights keeps the current lift of a raised municipality while its height eases", async () => {
  const { municipalities, plate, motion } = await buildTinyMotion();
  const raisedIndex = 1;
  motion.liftCurrent[raisedIndex] = RAISE_LIFT;
  motion.heightTargets[raisedIndex] = 3;
  motion.isHeightMoving = true;

  stepHeights(motion);

  const placement = readPlacement(plate, municipalities[raisedIndex].instanceId);
  assertClose(placement.lift, RAISE_LIFT);
  assertClose(placement.heightScale, 1 + 2 * HEIGHT_EASING_PER_FRAME);
});

test("BAS-04 stepHeights eases every frame and settles on the target", async () => {
  const { motion } = await buildTinyMotion();
  motion.heightTargets[0] = 4;
  motion.isHeightMoving = true;

  let frameCount = 0;
  while (stepHeights(motion)) {
    frameCount += 1;
  }

  assert.ok(frameCount > 10);
  assert.equal(motion.heightCurrent[0], 4);
  assert.equal(motion.isHeightMoving, false);
  assert.equal(stepHeights(motion), false);
});

test("BAS-04 stepHeights snaps at once when motion is reduced", async () => {
  const { motion } = await buildTinyMotion();
  motion.heightTargets[2] = 5;
  motion.isHeightMoving = true;
  motion.isMotionReduced = true;

  assert.equal(stepHeights(motion), false);
  assert.equal(motion.heightCurrent[2], 5);
});

test("BAS-04 stepLifts moves at most the lift share of the elapsed time and keeps the height", async () => {
  const { municipalities, plate, motion } = await buildTinyMotion();
  motion.heightCurrent[0] = 2;
  motion.liftTargets[0] = RAISE_LIFT;
  motion.movingLifts.add(0);

  assert.equal(stepLifts(motion, 18), true);
  assertClose(motion.liftCurrent[0], (RAISE_LIFT * 18) / LIFT_DURATION_MS);
  assertClose(readPlacement(plate, municipalities[0].instanceId).heightScale, 2);

  while (stepLifts(motion, 18)) {
    // keeps stepping until the lift settles
  }
  assert.equal(motion.liftCurrent[0], RAISE_LIFT);
  assert.equal(motion.movingLifts.size, 0);
});

test("BAS-11 retargetLifts lifts the pointed municipality and the selected ones only when enabled", async () => {
  const { motion } = await buildTinyMotion();
  const pointedOnly = { pointed: true, selected: false };

  retargetLifts(motion, buildRaise({ pointed: 1, selected: [2], isLiftEnabled: pointedOnly }));
  assert.deepEqual(Array.from(motion.liftTargets), [0, RAISE_LIFT, 0]);
  assert.deepEqual([...motion.movingLifts], [1]);

  const both = { pointed: true, selected: true };
  retargetLifts(motion, buildRaise({ pointed: 1, selected: [2], isLiftEnabled: both }));
  assert.deepEqual(Array.from(motion.liftTargets), [0, RAISE_LIFT, RAISE_LIFT]);
});

test("BAS-11 retargetLifts keeps everything down when motion is reduced", async () => {
  const { motion } = await buildTinyMotion();
  motion.isMotionReduced = true;
  const both = { pointed: true, selected: true };

  retargetLifts(motion, buildRaise({ pointed: 0, selected: [1, 2], isLiftEnabled: both }));

  assert.deepEqual(Array.from(motion.liftTargets), [0, 0, 0]);
});

test("BAS-11 readRaisedIndexes joins the selected and the pointed without repeats", () => {
  const pointedOnly = { pointed: true, selected: false };

  const raised = readRaisedIndexes(
    buildRaise({ pointed: 2, selected: [0, 2], isLiftEnabled: pointedOnly }),
  );

  assert.deepEqual(raised, [0, 2]);
});

test("BAS-11 readRaisedUnitIndexes maps unit codes to municipality indexes and drops unknown codes", async () => {
  const { municipalities } = await buildTinyMotion();
  const indexByCode = buildIndexByCode(municipalities);

  const raised = readRaisedUnitIndexes(indexByCode, {
    pointed: "3500002",
    selected: ["3500003", "9999999"],
  });

  assert.equal(raised.pointed, 1);
  assert.deepEqual([...raised.selected], [2]);
  assert.equal(
    readRaisedUnitIndexes(indexByCode, { pointed: "9999999", selected: [] }).pointed,
    null,
  );
});

test("BAS-11 readRaisedUnitIndexes maps an array of pointed codes for regions", async () => {
  const { municipalities } = await buildTinyMotion();
  const indexByCode = buildIndexByCode(municipalities);

  const raised = readRaisedUnitIndexes(indexByCode, {
    pointed: ["3500001", "3500002"],
    selected: ["3500003"],
  });

  assert.deepEqual([...raised.pointedIndexes], [0, 1]);
  assert.deepEqual([...raised.selected], [2]);
});

test("BAS-04 updateLineHeights puts borders on the top and the raised outline on the lift", async () => {
  const { municipalities, motion } = await buildTinyMotion();
  motion.heightCurrent[0] = 2;
  motion.liftCurrent[0] = 100;
  const lines = new THREE.LineSegments(buildOwnedLines(municipalities, [0]));

  updateLineHeights(lines, motion, 0);
  assert.equal(lines.geometry.attributes.position.getZ(0), PLATE_DEPTH * 2 + BORDER_OFFSET);

  updateLineHeights(lines, motion, 1);
  assert.equal(lines.geometry.attributes.position.getZ(0), PLATE_DEPTH * 2 + BORDER_OFFSET + 100);
});

test("BAS-04 stepCamera eases zoom and pan and reports when both settle", () => {
  const camera = new THREE.PerspectiveCamera();
  const zoomState = { current: 1, target: 2 };
  const pan = new THREE.Vector3();
  const panTarget = new THREE.Vector3(1, 0, 0);
  const cameraMotion = { camera, zoomState, pan, panTarget, isMotionReduced: false };

  assert.equal(stepCamera(cameraMotion), true);
  assert.ok(zoomState.current > 1 && zoomState.current < 2);
  assert.equal(camera.zoom, zoomState.current);

  while (stepCamera(cameraMotion)) {
    // keeps stepping until zoom and pan settle
  }
  assert.equal(zoomState.current, 2);
  assert.ok(pan.equals(panTarget));
});

test("BAS-04 readElapsed starts at 16 ms and caps a long gap at 50 ms", () => {
  assert.equal(readElapsed(undefined, 1000), 16);
  assert.equal(readElapsed(1000, 1020), 20);
  assert.equal(readElapsed(1000, 5000), 50);
});

test("BAS-03 recordFrameSample keeps the last samples and readMedianSample reads the middle", () => {
  /** @type {number[]} */
  const samples = [];
  for (let sample = 1; sample <= FRAME_SAMPLE_SIZE + 10; sample += 1) {
    recordFrameSample(samples, sample);
  }

  assert.equal(samples.length, FRAME_SAMPLE_SIZE);
  assert.equal(samples[0], 11);
  assert.equal(readMedianSample([5, 1, 3]), 3);
  assert.equal(readMedianSample([]), 0);
});
