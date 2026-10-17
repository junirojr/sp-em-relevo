import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { createMapMotion, placeMunicipality } from "./frame-loop.js";
import { buildMunicipalities } from "./geometry.js";
import {
  createPointTracker,
  isPointInOutline,
  pickMunicipalityIndex,
  readGroundPoint,
} from "./picking.js";
import { createScene } from "./scene.js";

const TINY_TOPOLOGY_URL = new URL("../domain/fixtures/tiny.topo.json", import.meta.url);

/**
 * @param {number} worldX
 */
async function buildTinyPickTarget(worldX) {
  const topology = JSON.parse(await readFile(TINY_TOPOLOGY_URL, "utf8"));
  const { municipalities, plate } = buildMunicipalities(topology);
  const view = createScene({ plate, municipalities });
  const motion = createMapMotion(plate, municipalities);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
  camera.position.set(worldX, 0, 50);
  camera.lookAt(worldX, 0, 0);
  camera.updateMatrixWorld();

  const target = {
    camera,
    raycaster: new THREE.Raycaster(),
    plate,
    mapGroup: view.mapGroup,
    municipalities,
    instanceToMunicipality: view.instanceToMunicipality,
    heightCurrent: motion.heightCurrent,
    liftCurrent: motion.liftCurrent,
  };
  return { motion, target };
}

/**
 * @param {Array<number | null>} pickedIndexes
 */
function buildTrackerProbe(pickedIndexes) {
  /** @type {Array<number | null>} */
  const changes = [];
  let pickCount = 0;
  const tracker = createPointTracker({
    pickIndex() {
      const picked = pickedIndexes[Math.min(pickCount, pickedIndexes.length - 1)];
      pickCount += 1;
      return picked;
    },
    onChange(index) {
      changes.push(index);
    },
  });
  return { tracker, changes, readPickCount: () => pickCount };
}

const SCREEN_CENTER = new THREE.Vector2(0, 0);
const FIRST_MUNICIPALITY_WORLD_X = -0.01;
const THIRD_MUNICIPALITY_WORLD_X = 0.01;

test("BAS-11 isPointInOutline identifies points inside simple polygon", () => {
  // Square from (0,0) to (10,10): 4 segments (x1, y1, x2, y2)
  const squareOutline = new Float32Array([0, 0, 10, 0, 10, 0, 10, 10, 10, 10, 0, 10, 0, 10, 0, 0]);

  assert.equal(isPointInOutline(5, 5, squareOutline), true);
  assert.equal(isPointInOutline(1, 1, squareOutline), true);
  assert.equal(isPointInOutline(-1, 5, squareOutline), false);
  assert.equal(isPointInOutline(15, 5, squareOutline), false);
});

test("BAS-11 isPointInOutline handles holes via even-odd rule", () => {
  // Outer square (0,0) to (100,100), inner hole (20,20) to (80,80)
  const donutOutline = new Float32Array([
    // Outer
    0, 0, 100, 0, 100, 0, 100, 100, 100, 100, 0, 100, 0, 100, 0, 0,
    // Hole
    20, 20, 80, 20, 80, 20, 80, 80, 80, 80, 20, 80, 20, 80, 20, 20,
  ]);

  // Inside outer ring, outside hole
  assert.equal(isPointInOutline(10, 10, donutOutline), true);
  // Inside hole
  assert.equal(isPointInOutline(50, 50, donutOutline), false);
  // Completely outside
  assert.equal(isPointInOutline(120, 50, donutOutline), false);
});

test("BAS-11 readGroundPoint intersects ray from camera onto ground plane", () => {
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
  camera.position.set(0, -200, 300);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const raycaster = new THREE.Raycaster();
  const target = new THREE.Vector3();

  const hit = readGroundPoint(new THREE.Vector2(0, 0), { camera, raycaster }, target);
  assert.ok(hit !== null);
  assert.equal(hit.z, 0);
  assert.ok(Math.abs(hit.x) < 1);
});

test("BAS-11 pickMunicipalityIndex reads the municipality under the cursor from the plate", async () => {
  const first = await buildTinyPickTarget(FIRST_MUNICIPALITY_WORLD_X);
  const third = await buildTinyPickTarget(THIRD_MUNICIPALITY_WORLD_X);

  assert.equal(pickMunicipalityIndex(SCREEN_CENTER, first.target, []), 0);
  assert.equal(pickMunicipalityIndex(SCREEN_CENTER, third.target, []), 2);
});

test("BAS-11 pickMunicipalityIndex keeps a lifted municipality while the ray crosses its resting footprint", async () => {
  const { motion, target } = await buildTinyPickTarget(FIRST_MUNICIPALITY_WORLD_X);
  // Lifted above the camera, the block itself is out of the ray's reach.
  motion.liftCurrent[0] = 1e6;
  placeMunicipality(motion, 0);

  assert.equal(pickMunicipalityIndex(SCREEN_CENTER, target, [0]), 0);
  assert.equal(pickMunicipalityIndex(SCREEN_CENTER, target, []), undefined);
});

test("BAS-11 point tracker picks once per frame however many moves arrive", () => {
  const { tracker, changes, readPickCount } = buildTrackerProbe([4]);

  for (let move = 0; move < 5; move += 1) {
    tracker.markPickPending();
  }
  tracker.flushPendingPick();
  tracker.flushPendingPick();

  assert.equal(readPickCount(), 1);
  assert.deepEqual(changes, [4]);
  assert.equal(tracker.readPointedIndex(), 4);
});

test("BAS-11 point tracker reports only a change of the pointed municipality", () => {
  const { tracker, changes } = buildTrackerProbe([4, 4, 4, null]);

  for (let frame = 0; frame < 4; frame += 1) {
    tracker.markPickPending();
    tracker.flushPendingPick();
  }

  assert.deepEqual(changes, [4, null]);
});

test("BAS-11 point tracker clears the pointed municipality once", () => {
  const { tracker, changes } = buildTrackerProbe([7]);
  tracker.markPickPending();
  tracker.flushPendingPick();

  tracker.clearPointed();
  tracker.clearPointed();

  assert.deepEqual(changes, [7, null]);
  assert.equal(tracker.readPointedIndex(), null);
});

test("BAS-11 point tracker drops the pending pick when the pointer leaves the map", () => {
  const { tracker, changes, readPickCount } = buildTrackerProbe([4]);

  tracker.markPickPending();
  tracker.clearPointed();
  tracker.flushPendingPick();

  assert.equal(readPickCount(), 0);
  assert.deepEqual(changes, []);
  assert.equal(tracker.readPointedIndex(), null);
});

test("BAS-11 point tracker drops the pending pick when a pan clears the pointed municipality", () => {
  const { tracker, changes, readPickCount } = buildTrackerProbe([4]);
  tracker.markPickPending();
  tracker.flushPendingPick();
  tracker.markPickPending();

  tracker.clearPointed();
  tracker.flushPendingPick();

  assert.equal(readPickCount(), 1);
  assert.deepEqual(changes, [4, null]);
  assert.equal(tracker.readPointedIndex(), null);
});

test("BAS-11 point tracker picks again on the move after the pointer returns to the map", () => {
  const { tracker, changes, readPickCount } = buildTrackerProbe([4]);
  tracker.markPickPending();
  tracker.clearPointed();

  tracker.markPickPending();
  tracker.flushPendingPick();

  assert.equal(readPickCount(), 1);
  assert.deepEqual(changes, [4]);
  assert.equal(tracker.readPointedIndex(), 4);
});
