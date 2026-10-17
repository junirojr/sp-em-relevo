import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { PLATE_DEPTH, WORLD_UNITS_PER_SVG_UNIT } from "./constants.js";
import { buildMunicipalities } from "./geometry.js";
import { applyPalette, countMapMeshes, createScene, paintMunicipalities } from "./scene.js";

const TINY_TOPOLOGY_URL = new URL("../domain/fixtures/tiny.topo.json", import.meta.url);
const TINY_WIDTH_SVG_UNITS = 30;
const TINY_HEIGHT_SVG_UNITS = 10;

async function buildTinyScene() {
  const topology = JSON.parse(await readFile(TINY_TOPOLOGY_URL, "utf8"));
  const { municipalities, plate } = buildMunicipalities(topology);
  return { municipalities, plate, view: createScene({ plate, municipalities }) };
}

/**
 * @param {number} actual
 * @param {number} expected
 */
function assertClose(actual, expected) {
  // Geometry positions are float32, so world sizes carry about seven significant digits.
  assert.ok(Math.abs(actual - expected) < 1e-6, `expected ${expected}, got ${actual}`);
}

test("BAS-03 createScene measures mapSize in world units after the map group scales the plate", async () => {
  const { view } = await buildTinyScene();

  assertClose(view.mapSize.x, TINY_WIDTH_SVG_UNITS * WORLD_UNITS_PER_SVG_UNIT);
  assertClose(view.mapSize.y, TINY_HEIGHT_SVG_UNITS * WORLD_UNITS_PER_SVG_UNIT);
  assertClose(view.mapSize.z, PLATE_DEPTH * WORLD_UNITS_PER_SVG_UNIT);
});

test("BAS-03 createScene sizes the ground and the shadow reach from the world-unit mapSize", async () => {
  const { view } = await buildTinyScene();
  const groundSize = new THREE.Box3().setFromObject(view.ground).getSize(new THREE.Vector3());
  const expectedReach = Math.hypot(view.mapSize.x, view.mapSize.y) * 0.55;

  assertClose(groundSize.x, view.mapSize.x * 1.8);
  assertClose(groundSize.y, view.mapSize.y * 1.8);
  assertClose(view.sun.shadow.camera.right, expectedReach);
});

test("BAS-03 countMapMeshes sees one mesh holding every municipality instance", async () => {
  const { municipalities, view } = await buildTinyScene();

  assert.equal(countMapMeshes(view.mapGroup), 1);
  assert.equal(view.plate.instanceCount, municipalities.length);
});

test("BAS-03 applyPalette sets the background, the borders and the raised outline", async () => {
  const { view } = await buildTinyScene();
  /** @type {THREE.Color[]} */
  const clearColors = [];
  const renderer = {
    /** @param {THREE.Color} color */
    setClearColor(color) {
      clearColors.push(color);
    },
  };
  const palette = { background: "#102030", border: "#405060", regionBorder: "#708090", colors: [] };

  applyPalette({ renderer, borders: view.borders, raisedOutline: view.raisedOutline }, palette);

  assert.equal(clearColors.length, 1);
  assert.equal(clearColors[0].getHexString(), new THREE.Color("#102030").getHexString());
  assert.equal(
    view.borders.material.color.getHexString(),
    new THREE.Color("#405060").getHexString(),
  );
  assert.equal(
    view.raisedOutline.material.color.getHexString(),
    new THREE.Color("#405060").getHexString(),
  );
  assert.equal(view.borders.material.transparent, false);
  assert.equal(view.borders.material.opacity, 1);
});

test("BAS-03 paintMunicipalities paints each instance with the palette color at its position", async () => {
  const { municipalities, plate } = await buildTinyScene();
  const colors = ["#ff0000", "#00ff00", "#0000ff"];

  paintMunicipalities({ plate, municipalities }, new Uint8Array([2, 0, 1]), colors);

  const painted = municipalities.map((municipality) =>
    plate.getColorAt(municipality.instanceId, new THREE.Color()).getHexString(),
  );
  assert.deepEqual(painted, ["0000ff", "ff0000", "00ff00"]);
});

test("BAS-03 paintMunicipalities paints missing positions with neutral color", async () => {
  const { municipalities, plate } = await buildTinyScene();
  const colors = ["#ff0000", "#00ff00", "#0000ff"];

  paintMunicipalities({ plate, municipalities }, new Uint8Array([2, 255, 1]), colors, "#888888");

  const painted = municipalities.map((municipality) =>
    plate.getColorAt(municipality.instanceId, new THREE.Color()).getHexString(),
  );
  assert.deepEqual(painted, ["0000ff", "888888", "00ff00"]);
});
