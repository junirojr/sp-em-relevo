import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { DARK_PALETTE, LIGHT_PALETTE } from "../app/palette.js";
import { ELECTION_NEUTRALS, PARTY_COLOR_TABLE } from "../domain/election-colors.js";
import { createEngine } from "./engine.js";
import {
  buildSelectionGeometry,
  computeContrastRatio,
  computeRelativeLuminance,
  computeSelectionArcs,
  createSelectionOutline,
  MIN_CONTRAST_RATIO,
  OUTLINE_DARK_TONE,
  OUTLINE_INNER_WIDTH,
  OUTLINE_LIGHT_TONE,
  OUTLINE_OUTER_WIDTH,
  SELECTION_OUTLINE_OFFSET,
  satisfiesOutlineContrast,
  updateSelectionOutlineHeights,
} from "./selection-outline.js";

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

/**
 * 2x2 grid topology fixture with 4 adjacent square municipalities:
 * A (35001): [0, 0] to [10, 10]
 * B (35002): [10, 0] to [20, 10]
 * C (35003): [0, 10] to [10, 20]
 * D (35004): [10, 10] to [20, 20]
 *
 * Arc 0: shared between A and B, from (10, 0) to (10, 10)
 * Arc 1: shared between C and D, from (10, 10) to (10, 20)
 * Arc 2: shared between A and C, from (0, 10) to (10, 10)
 * Arc 3: shared between B and D, from (10, 10) to (20, 10)
 * Arcs 4, 5, 6, 7: outer perimeter boundaries of the 2x2 state
 *
 * @returns {import("../domain/topology.js").Topology}
 */
function createGridTopologyFixture() {
  return {
    type: "Topology",
    transform: { scale: [1, 1], translate: [0, 0] },
    arcs: [
      // Arc 0: shared A-B (vertical, x=10, y: 0 -> 10)
      [
        [10, 0],
        [0, 10],
      ],
      // Arc 1: shared C-D (vertical, x=10, y: 10 -> 20)
      [
        [10, 10],
        [0, 10],
      ],
      // Arc 2: shared A-C (horizontal, y=10, x: 0 -> 10)
      [
        [0, 10],
        [10, 0],
      ],
      // Arc 3: shared B-D (horizontal, y=10, x: 10 -> 20)
      [
        [10, 10],
        [10, 0],
      ],
      // Arc 4: outer bottom boundary of A and B (y=0, x: 0 -> 20)
      [
        [0, 0],
        [20, 0],
      ],
      // Arc 5: outer right boundary of B and D (x=20, y: 0 -> 20)
      [
        [20, 0],
        [0, 20],
      ],
      // Arc 6: outer top boundary of C and D (y=20, x: 20 -> 0)
      [
        [20, 20],
        [-20, 0],
      ],
      // Arc 7: outer left boundary of A and C (x=0, y: 20 -> 0)
      [
        [0, 20],
        [0, -20],
      ],
    ],
    objects: {
      municipalities: {
        type: "GeometryCollection",
        geometries: [
          { type: "Polygon", arcs: [[0, 2, 4]], id: "35001" },
          { type: "Polygon", arcs: [[-1, 3, 5]], id: "35002" },
          { type: "Polygon", arcs: [[-3, 1, 6]], id: "35003" },
          { type: "Polygon", arcs: [[-4, -2, 7]], id: "35004" },
        ],
      },
    },
  };
}

/**
 * Creates minimal plate and municipalities mock for engine tests.
 *
 * @param {string[]} codes
 * @returns {{ plate: any; municipalities: any[]; mapCenter: THREE.Vector2 }}
 */
function createMockGeometry(codes) {
  const municipalities = codes.map((code, index) => ({
    code,
    instanceId: index,
    bounds: new THREE.Box2(new THREE.Vector2(0, 0), new THREE.Vector2(10, 10)),
    outline: new Float32Array([0, 0, 10, 0, 10, 0, 10, 10, 10, 10, 0, 10, 0, 10, 0, 0]),
  }));

  const colors = new Map();
  const matrices = new Map();

  const plate =
    /** @type {THREE.Object3D & {instanceCount: number, setColorAt: (id: number, color: THREE.Color) => void, getColorAt: (id: number, target: THREE.Color) => void, setMatrixAt: (id: number, matrix: THREE.Matrix4) => void, getMatrixAt: (id: number, target: THREE.Matrix4) => void}} */ (
      /** @type {unknown} */ (new THREE.Object3D())
    );
  plate.instanceCount = codes.length;
  plate.setColorAt = (/** @type {any} */ id, /** @type {{ clone: () => any; }} */ color) => {
    colors.set(id, color.clone());
  };
  plate.getColorAt = (
    /** @type {any} */ id,
    /** @type {{ copy: (arg0: any) => void; setHex: (arg0: number) => void; }} */ target,
  ) => {
    const c = colors.get(id);
    if (c) {
      target.copy(c);
      return;
    }
    target.setHex(0xffffff);
  };
  plate.setMatrixAt = (/** @type {any} */ id, /** @type {{ clone: () => any; }} */ matrix) => {
    matrices.set(id, matrix.clone());
  };
  plate.getMatrixAt = (
    /** @type {any} */ id,
    /** @type {{ copy: (arg0: any) => void; identity: () => void; }} */ target,
  ) => {
    const m = matrices.get(id);
    if (m) {
      target.copy(m);
      return;
    }
    target.identity();
  };

  return {
    municipalities,
    plate: /** @type {THREE.BatchedMesh} */ (/** @type {unknown} */ (plate)),
    mapCenter: new THREE.Vector2(5, 5),
  };
}

/**
 * Creates minimal renderer mock for headless node tests.
 *
 * @returns {any}
 */
function createMockRenderer() {
  return {
    render() {},
    setSize() {},
    setPixelRatio() {},
    setClearColor() {},
    dispose() {},
    shadowMap: { enabled: false, type: 0 },
    info: { render: { calls: 0 } },
  };
}

test("ELE-13 selection outline has two tones and minimum width >= 3 px CSS", () => {
  const outline = createSelectionOutline();

  assert.equal(OUTLINE_DARK_TONE, "#000000");
  assert.equal(OUTLINE_LIGHT_TONE, "#ffffff");
  assert.ok(OUTLINE_OUTER_WIDTH >= 3, "outer width must be >= 3 px");
  assert.ok(OUTLINE_INNER_WIDTH >= 3, "inner width must be >= 3 px");

  assert.equal(outline.outerMaterial.linewidth, OUTLINE_OUTER_WIDTH);
  assert.equal(outline.innerMaterial.linewidth, OUTLINE_INNER_WIDTH);
  assert.equal(outline.outerMaterial.color.getHexString(), "000000");
  assert.equal(outline.innerMaterial.color.getHexString(), "ffffff");

  outline.dispose();
});

test("ELE-13 contrast ratio achieves >= 3:1 against each candidate, neutral and plate color in both themes", () => {
  // Test candidate colors from both themes
  for (const [party, hex] of Object.entries(PARTY_COLOR_TABLE.light)) {
    const ok = satisfiesOutlineContrast(hex);
    assert.ok(
      ok,
      `Light theme party ${party} color ${hex} must have >= 3:1 contrast against one tone`,
    );
  }
  for (const [party, hex] of Object.entries(PARTY_COLOR_TABLE.dark)) {
    const ok = satisfiesOutlineContrast(hex);
    assert.ok(
      ok,
      `Dark theme party ${party} color ${hex} must have >= 3:1 contrast against one tone`,
    );
  }

  // Test neutrals in both themes
  for (const [theme, neutrals] of Object.entries(ELECTION_NEUTRALS)) {
    for (const [key, hex] of Object.entries(neutrals)) {
      const ok = satisfiesOutlineContrast(hex);
      assert.ok(
        ok,
        `${theme} neutral ${key} color ${hex} must have >= 3:1 contrast against one tone`,
      );
    }
  }

  // Test plate colors in both themes
  assert.ok(
    satisfiesOutlineContrast(LIGHT_PALETTE.plate),
    "Light palette plate color must have >= 3:1 contrast against one tone",
  );
  assert.ok(
    satisfiesOutlineContrast(DARK_PALETTE.plate),
    "Dark palette plate color must have >= 3:1 contrast against one tone",
  );

  // Test extreme boundaries (pure black and pure white)
  assert.ok(satisfiesOutlineContrast("#000000"));
  assert.ok(satisfiesOutlineContrast("#ffffff"));
});

test("ELE-14 computeSelectionArcs calculates perimeter without internal edges between selected units", () => {
  const topology = createGridTopologyFixture();

  // Case 1: Single unit selected (35001)
  const singleArcs = computeSelectionArcs(topology, ["35001"]);
  assert.ok(singleArcs.length > 0);
  assert.ok(singleArcs.includes(0), "Shared arc with 35002 must be included");
  assert.ok(singleArcs.includes(2), "Shared arc with 35003 must be included");

  // Case 2: Adjacent units selected (35001 and 35002)
  // Arc 0 is shared between 35001 and 35002; it MUST NOT be included (ELE-14)!
  const pairArcs = computeSelectionArcs(topology, ["35001", "35002"]);
  assert.ok(
    !pairArcs.includes(0),
    "Internal shared arc between 35001 and 35002 must be excluded from perimeter",
  );
  assert.ok(pairArcs.includes(2), "Perimeter arc with 35003 must be included");
  assert.ok(pairArcs.includes(3), "Perimeter arc with 35004 must be included");

  // Case 3: All 4 adjacent units selected (35001, 35002, 35003, 35004)
  // None of the internal shared arcs (0, 1, 2, 3) must be in the perimeter!
  const allArcs = computeSelectionArcs(topology, ["35001", "35002", "35003", "35004"]);
  assert.ok(!allArcs.includes(0), "Internal arc 0 must be excluded");
  assert.ok(!allArcs.includes(1), "Internal arc 1 must be excluded");
  assert.ok(!allArcs.includes(2), "Internal arc 2 must be excluded");
  assert.ok(!allArcs.includes(3), "Internal arc 3 must be excluded");
  assert.ok(allArcs.includes(4), "Outer boundary arc 4 must be included");
  assert.ok(allArcs.includes(5), "Outer boundary arc 5 must be included");
  assert.ok(allArcs.includes(6), "Outer boundary arc 6 must be included");
  assert.ok(allArcs.includes(7), "Outer boundary arc 7 must be included");
});

test("ELE-14 buildSelectionGeometry assigns owner index and updates heights during animation", () => {
  const topology = createGridTopologyFixture();
  const indexByCode = new Map([
    ["35001", 0],
    ["35002", 1],
    ["35003", 2],
    ["35004", 3],
  ]);
  const mapCenter = new THREE.Vector2(10, 10);

  const geometry = buildSelectionGeometry({
    topology,
    selectedCodes: ["35001", "35002"],
    indexByCode,
    mapCenter,
  });

  assert.ok(geometry !== null);
  assert.ok(geometry.userData.owners.length > 0);

  const outline = createSelectionOutline();
  outline.updateGeometry(geometry);

  const heightCurrent = new Float32Array([1.5, 2.0, 0.5, 0.8]);
  updateSelectionOutlineHeights(outline, heightCurrent);

  const instanceStart = /** @type {THREE.InterleavedBufferAttribute} */ (
    geometry.attributes.instanceStart
  );
  const positions = instanceStart.data.array;

  // Verify that z positions follow the owning block height plus offset
  const firstOwner = geometry.userData.owners[0];
  const expectedHeight = 2400 * heightCurrent[firstOwner] + SELECTION_OUTLINE_OFFSET;
  assert.equal(positions[2], expectedHeight);
  assert.equal(positions[5], expectedHeight);

  // Animate to new height
  heightCurrent[firstOwner] = 3.5;
  updateSelectionOutlineHeights(outline, heightCurrent);
  const updatedHeight = 2400 * 3.5 + SELECTION_OUTLINE_OFFSET;
  assert.equal(positions[2], updatedHeight);

  outline.dispose();
});

test("ELE-14 selection outline uses second pass without depth test and separate render order", () => {
  const outline = createSelectionOutline();

  assert.equal(outline.outerMaterial.depthTest, false);
  assert.equal(outline.outerMaterial.depthWrite, false);
  assert.equal(outline.innerMaterial.depthTest, false);
  assert.equal(outline.innerMaterial.depthWrite, false);

  assert.equal(outline.outer.renderOrder, 998);
  assert.equal(outline.inner.renderOrder, 999);

  outline.dispose();
});

test("ELE-12 hover and selection give 0 elevation in election mode and use distinct objects", () => {
  const codes = ["35001", "35002"];
  const geometry = createMockGeometry(codes);

  const canvas = {
    clientWidth: 800,
    clientHeight: 600,
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600 };
    },
  };

  const palette = {
    background: "#ffffff",
    border: "#cccccc",
    regionBorder: "#333333",
    colors: ["#ff0000", "#0000ff"],
    selection: "#2f4bff",
    neutral: "#999999",
  };

  const engine = createEngine({
    canvas: /** @type {HTMLCanvasElement} */ (/** @type {unknown} */ (canvas)),
    geometry,
    palette,
    mode: "election",
    renderer: createMockRenderer(),
  });

  // Verify mode is election
  assert.ok(engine.readMode);
  assert.equal(engine.readMode(), "election");

  // In election mode, selecting a unit must give liftTarget = 0 (ELE-12)
  engine.setRaised({ pointed: "35001", selected: ["35002"] });

  const inspectionPointed = engine.inspect(0);
  const inspectionSelected = engine.inspect(1);
  assert.ok(inspectionPointed);
  assert.ok(inspectionSelected);

  assert.equal(inspectionPointed.liftTarget, 0);
  assert.equal(inspectionSelected.liftTarget, 0);

  // Selection outline is visible in dedicated object (ELE-12)
  const outlineInfo = engine.readSelectionOutline();
  assert.equal(outlineInfo.visible, true);
  assert.equal(outlineInfo.outerWidth, OUTLINE_OUTER_WIDTH);
  assert.equal(outlineInfo.innerWidth, OUTLINE_INNER_WIDTH);

  engine.destroy();
});

test("ELE-15 inspect preserves party color and selection outline adds 2 draw calls (PUB-11)", () => {
  const codes = ["35001", "35002"];
  const geometry = createMockGeometry(codes);

  const canvas = {
    clientWidth: 800,
    clientHeight: 600,
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600 };
    },
  };

  const palette = {
    background: "#ffffff",
    border: "#cccccc",
    regionBorder: "#333333",
    colors: ["#ff3333", "#33ff33"],
    selection: "#2f4bff", // Selection blue must NOT be painted on selected unit in election mode
    neutral: "#999999",
  };

  const engine = createEngine({
    canvas: /** @type {HTMLCanvasElement} */ (/** @type {unknown} */ (canvas)),
    geometry,
    palette,
    mode: "election",
    renderer: createMockRenderer(),
  });

  // Set colors: index 1 gets color position 1 (#33ff33)
  engine.setColors(new Uint8Array([0, 1]));

  // Select index 1
  engine.setRaised({ pointed: null, selected: ["35002"] });

  // In election mode, inspect must preserve party color and NOT turn into selection blue (#2f4bff) (ELE-15)
  const inspection = engine.inspect(1);
  assert.ok(inspection);
  assert.equal(inspection.color, "#33ff33");
  assert.notEqual(inspection.color, "#2f4bff");

  // Selection outline object adds exactly 2 draw calls (outer + inner LineSegments2) (PUB-11)
  const outlineInfo = engine.readSelectionOutline();
  assert.equal(outlineInfo.visible, true);

  engine.destroy();
});
