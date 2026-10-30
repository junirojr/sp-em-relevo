import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { normalizeBox2, readBoxFraming } from "./camera.js";
import { createEngine } from "./engine.js";
import { buildMunicipalities, buildUnits } from "./geometry.js";

if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
if (typeof globalThis.window === "undefined") {
  globalThis.window = /** @type {any} */ ({
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  });
}

const TINY_TOPOLOGY_URL = new URL("../domain/fixtures/tiny.topo.json", import.meta.url);

async function readTinyTopology() {
  return JSON.parse(await readFile(TINY_TOPOLOGY_URL, "utf8"));
}

function createStatesTopologyFixture() {
  return {
    type: "Topology",
    transform: { scale: [1, 1], translate: [0, 0] },
    arcs: [
      [
        [0, 0],
        [100, 0],
        [0, 100],
        [-100, 0],
        [0, -100],
      ],
      [
        [100, 0],
        [100, 0],
        [0, 100],
        [-100, 0],
        [0, -100],
      ],
    ],
    objects: {
      states: {
        type: "GeometryCollection",
        geometries: [
          { type: "Polygon", arcs: [[0]], properties: { sigla: "SP", name: "Sao Paulo" } },
          { type: "Polygon", arcs: [[1]], properties: { sigla: "RJ", name: "Rio de Janeiro" } },
        ],
      },
    },
  };
}

function createMockCanvas() {
  return {
    clientWidth: 800,
    clientHeight: 600,
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600 };
    },
  };
}

function createMockRenderer() {
  let isDisposed = false;
  return {
    render() {},
    setSize() {},
    setPixelRatio() {},
    setClearColor() {},
    dispose() {
      isDisposed = true;
    },
    get isDisposed() {
      return isDisposed;
    },
    shadowMap: { enabled: false, type: 0 },
    info: {
      render: { calls: 0, triangles: 0 },
      memory: { geometries: 0 },
    },
  };
}

const TEST_PALETTE = {
  background: "#ffffff",
  border: "#cccccc",
  regionBorder: "#333333",
  colors: ["#2b6cb0", "#c53030"],
  selection: "#2f4bff",
  neutral: "#999999",
};

test("DRL-01 buildUnits resolves custom collection names and property codes", () => {
  const topology = createStatesTopologyFixture();
  const geometry = buildUnits(topology, "states");

  assert.equal(geometry.municipalities.length, 2);
  assert.equal(geometry.municipalities[0].code, "SP");
  assert.equal(geometry.municipalities[1].code, "RJ");
  assert.equal(geometry.plate.instanceCount, 2);
});

test("DRL-02 replaceMesh dynamically swaps mesh without recreating or destroying renderer", async () => {
  const statesTopology = createStatesTopologyFixture();
  const statesGeometry = buildUnits(statesTopology, "states");
  const renderer = createMockRenderer();
  const canvas = createMockCanvas();

  const engine = createEngine({
    canvas: /** @type {any} */ (canvas),
    renderer: /** @type {any} */ (renderer),
    geometry: statesGeometry,
    palette: TEST_PALETTE,
  });

  assert.equal(engine.readStats().instanceCount, 2);
  assert.equal(renderer.isDisposed, false);

  let oldPlateDisposed = false;
  const originalDispose = statesGeometry.plate.dispose.bind(statesGeometry.plate);
  statesGeometry.plate.dispose = () => {
    oldPlateDisposed = true;
    originalDispose();
  };

  const municipalTopology = await readTinyTopology();
  const municipalGeometry = buildMunicipalities(municipalTopology);

  engine.replaceMesh(municipalGeometry);

  assert.equal(oldPlateDisposed, true);
  assert.equal(renderer.isDisposed, false);
  assert.equal(engine.readStats().instanceCount, 3);
  assert.equal(engine.inspect(0)?.code, "3500001");

  engine.destroy();
  assert.equal(renderer.isDisposed, true);
});

test("DRL-03 replaceMesh accepts raw Topology object directly", async () => {
  const statesTopology = createStatesTopologyFixture();
  const statesGeometry = buildUnits(statesTopology, "states");
  const renderer = createMockRenderer();
  const canvas = createMockCanvas();

  const engine = createEngine({
    canvas: /** @type {any} */ (canvas),
    renderer: /** @type {any} */ (renderer),
    geometry: statesGeometry,
    palette: TEST_PALETTE,
  });

  assert.equal(engine.readStats().instanceCount, 2);

  const tinyTopology = await readTinyTopology();
  engine.replaceMesh(tinyTopology);

  assert.equal(engine.readStats().instanceCount, 3);
  assert.equal(engine.inspect(0)?.code, "3500001");

  engine.destroy();
});

test("DRL-04 frameBounds sets camera targets to enclose active territory bounding box", () => {
  const statesTopology = createStatesTopologyFixture();
  const statesGeometry = buildUnits(statesTopology, "states");
  const renderer = createMockRenderer();
  const canvas = createMockCanvas();

  const engine = createEngine({
    canvas: /** @type {any} */ (canvas),
    renderer: /** @type {any} */ (renderer),
    geometry: statesGeometry,
    palette: TEST_PALETTE,
  });

  const territoryBox = new THREE.Box2(new THREE.Vector2(-20, -10), new THREE.Vector2(20, 10));

  engine.frameBounds(territoryBox);

  const cameraState = engine.readCamera();
  assert.ok(typeof cameraState.zoomTarget === "number");
  assert.ok(cameraState.zoomTarget >= 1);

  engine.frameBoundsNow(territoryBox);
  const immediateState = engine.readCamera();
  assert.equal(immediateState.zoomTarget, cameraState.zoomTarget);

  engine.destroy();
});

test("DRL-05 readBoxFraming handles varied bounding box representations", () => {
  const mapSize = new THREE.Vector3(200, 100, 10);

  const box2 = new THREE.Box2(new THREE.Vector2(-50, -25), new THREE.Vector2(50, 25));
  const framing2 = readBoxFraming(box2, mapSize);
  assert.ok(framing2.pan instanceof THREE.Vector3);
  assert.ok(framing2.zoom >= 1);

  const box3 = new THREE.Box3(new THREE.Vector3(-10, -10, 0), new THREE.Vector3(10, 10, 5));
  const framing3 = readBoxFraming(box3, mapSize);
  assert.ok(framing3.zoom >= 1);

  const rawArray = [-20, -20, 20, 20];
  const framingArray = readBoxFraming(rawArray, mapSize);
  assert.ok(framingArray.zoom >= 1);

  const plainBox = { minX: -30, minY: -30, maxX: 30, maxY: 30 };
  const framingPlain = readBoxFraming(plainBox, mapSize);
  assert.ok(framingPlain.zoom >= 1);

  const normalized = normalizeBox2(null);
  assert.equal(normalized, null);
});
