import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MockDocument } from "../../tests/e2e/helpers/dom-mock.js";
import { changeTerritory } from "../features/navigation/navigation-slice.js";
import { parseMunicipalities } from "./data-loader.js";
import { initElectionWiring } from "./election-wiring.js";
import { changeData, changeTab, createInitialState, reduceRootState } from "./state.js";
import { createStore } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates a mock fetch function reading from local file system.
 *
 * @returns {typeof fetch}
 */
function createLocalFileFetch() {
  const rootDir = path.resolve(__dirname, "../../");
  return /** @type {any} */ (
    async (/** @type {string} */ inputUrl) => {
      const cleanPath = String(inputUrl).replace(/^\.\//, "");
      const absolutePath = path.resolve(rootDir, cleanPath);
      if (!fs.existsSync(absolutePath)) {
        return {
          ok: false,
          status: 404,
          json: async () => {
            throw new Error(`File not found: ${absolutePath}`);
          },
        };
      }
      const rawContent = fs.readFileSync(absolutePath, "utf8");
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(rawContent),
      };
    }
  );
}

/**
 * Creates a mock DOM document populated with required election element slots.
 *
 * @returns {MockDocument}
 */
function createElectionTestDom() {
  const doc = new MockDocument();

  const modeSlot = doc.createElement("div");
  modeSlot.id = "mode-selector-slot";

  const searchContainer = doc.createElement("div");
  searchContainer.id = "search-container";

  const stageOverlay = doc.createElement("div");
  stageOverlay.id = "stage-overlay";

  const bannerSlot = doc.createElement("div");
  bannerSlot.id = "election-banner-slot";

  const scoreboardSlot = doc.createElement("div");
  scoreboardSlot.id = "election-scoreboard-slot";

  const sourceSlot = doc.createElement("div");
  sourceSlot.id = "election-source-slot";

  const sidebarContent = doc.createElement("div");
  sidebarContent.className = "sidebar-content";

  doc.body.append(
    modeSlot,
    searchContainer,
    stageOverlay,
    bannerSlot,
    scoreboardSlot,
    sourceSlot,
    sidebarContent,
  );

  return doc;
}

/**
 * Creates a mock engine that records setColors, setHeightTargets, and setPalette calls.
 */
function createMockEngine() {
  return {
    lastColors: /** @type {Uint8Array | null} */ (null),
    lastHeights: /** @type {Float32Array | null} */ (null),
    lastPalette: /** @type {any} */ (null),
    /** @param {Uint8Array} colors */
    setColors(colors) {
      this.lastColors = colors;
    },
    /** @param {Float32Array} heights */
    setHeightTargets(heights) {
      this.lastHeights = heights;
    },
    /** @param {any} palette */
    setPalette(palette) {
      this.lastPalette = palette;
    },
    setRaised() {},
  };
}

describe("Election Wiring - National Presidential & Territory Drill", () => {
  it("ELE-24 initializes national presidential 1st round when activeUf is null", async () => {
    const doc = createElectionTestDom();
    const engine = createMockEngine();
    const localFetch = createLocalFileFetch();

    const statesPath = path.resolve(__dirname, "../../data/national/states.json");
    const statesDoc = JSON.parse(fs.readFileSync(statesPath, "utf8"));
    const nationalData = {
      municipalities: statesDoc.states,
      regions: [],
    };

    const initialState = createInitialState(nationalData, {
      tab: "first-round",
      uf: null,
    });
    const store = createStore(reduceRootState, initialState);

    const wiring = initElectionWiring({
      store,
      engine: /** @type {any} */ (engine),
      documentRef: /** @type {any} */ (doc),
      fetchImpl: localFetch,
    });

    // Allow async load to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    const results = wiring.getElectionResults();
    const resultCodes = Object.keys(results);
    assert.equal(resultCodes.length, 27);

    // Verify engine was driven with 27 items
    assert.ok(engine.lastHeights);
    assert.equal(engine.lastHeights.length, 27);
    assert.ok(engine.lastColors);
    assert.equal(engine.lastColors.length, 27);

    // Verify office selector is hidden in national view (only president available)
    const officeSlot = doc.getElementById("office-selector-slot");
    assert.ok(officeSlot);
    assert.equal(officeSlot.hidden, true);

    wiring.destroy();
  });

  it("ELE-24 initializes national presidential 2nd round when activeUf is null", async () => {
    const doc = createElectionTestDom();
    const engine = createMockEngine();
    const localFetch = createLocalFileFetch();

    const statesPath = path.resolve(__dirname, "../../data/national/states.json");
    const statesDoc = JSON.parse(fs.readFileSync(statesPath, "utf8"));
    const nationalData = {
      municipalities: statesDoc.states,
      regions: [],
    };

    const initialState = createInitialState(nationalData, {
      tab: "second-round",
      uf: null,
    });
    const store = createStore(reduceRootState, initialState);

    const wiring = initElectionWiring({
      store,
      engine: /** @type {any} */ (engine),
      documentRef: /** @type {any} */ (doc),
      fetchImpl: localFetch,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const results = wiring.getElectionResults();
    assert.equal(Object.keys(results).length, 27);

    assert.ok(engine.lastHeights);
    assert.equal(engine.lastHeights.length, 27);
    assert.ok(engine.lastColors);
    assert.equal(engine.lastColors.length, 27);

    wiring.destroy();
  });

  it("ELE-25 preserves active election mode and re-projects on state drill-down and drill-up", async () => {
    const doc = createElectionTestDom();
    const engine = createMockEngine();
    const localFetch = createLocalFileFetch();

    const statesPath = path.resolve(__dirname, "../../data/national/states.json");
    const statesDoc = JSON.parse(fs.readFileSync(statesPath, "utf8"));
    const nationalData = {
      municipalities: statesDoc.states,
      regions: [],
    };

    const spMunPath = path.resolve(__dirname, "../../data/municipalities.json");
    const spMunDoc = JSON.parse(fs.readFileSync(spMunPath, "utf8"));
    const spData = {
      municipalities: parseMunicipalities(spMunDoc),
      regions: [],
    };

    // 1. Start in national view in first-round mode
    const initialState = createInitialState(nationalData, {
      tab: "first-round",
      uf: null,
    });
    const store = createStore(reduceRootState, initialState);

    const wiring = initElectionWiring({
      store,
      engine: /** @type {any} */ (engine),
      documentRef: /** @type {any} */ (doc),
      fetchImpl: localFetch,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(engine.lastHeights?.length, 27);

    // 2. Drill-down to São Paulo (activeUf: "35")
    store.dispatch(changeTerritory("35"));
    store.dispatch(changeData(spData));

    // Active election mode MUST be preserved
    assert.equal(store.getState().tab, "first-round");

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Now engine should have 645 heights for SP municipalities
    assert.equal(engine.lastHeights?.length, 645);
    assert.equal(engine.lastColors?.length, 645);

    // Office selector slot should now be visible for state view
    const officeSlot = doc.getElementById("office-selector-slot");
    assert.ok(officeSlot);
    assert.equal(officeSlot.hidden, false);

    // 3. Drill-up back to Brasil (activeUf: null)
    store.dispatch(changeTerritory(null));
    store.dispatch(changeData(nationalData));

    // Active election mode MUST still be preserved
    assert.equal(store.getState().tab, "first-round");

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Engine should have returned to 27 heights for national UFs
    assert.equal(engine.lastHeights?.length, 27);
    assert.equal(engine.lastColors?.length, 27);
    assert.equal(officeSlot.hidden, true);

    wiring.destroy();
  });

  it("ELE-24 switching tab in national view updates projection between 1st round, 2nd round and indicators", async () => {
    const doc = createElectionTestDom();
    const engine = createMockEngine();
    const localFetch = createLocalFileFetch();

    const statesPath = path.resolve(__dirname, "../../data/national/states.json");
    const statesDoc = JSON.parse(fs.readFileSync(statesPath, "utf8"));
    const nationalData = {
      municipalities: statesDoc.states,
      regions: [],
    };

    let restoredIndicatorCalled = false;
    const initialState = createInitialState(nationalData, {
      tab: "indicators",
      uf: null,
    });
    const store = createStore(reduceRootState, initialState);

    const wiring = initElectionWiring({
      store,
      engine: /** @type {any} */ (engine),
      documentRef: /** @type {any} */ (doc),
      fetchImpl: localFetch,
      restoreIndicator: () => {
        restoredIndicatorCalled = true;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    // Switch to first-round
    store.dispatch(changeTab("first-round"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(engine.lastHeights?.length, 27);

    // Switch to second-round
    store.dispatch(changeTab("second-round"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(engine.lastHeights?.length, 27);

    // Switch back to indicators
    store.dispatch(changeTab("indicators"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(restoredIndicatorCalled, true);

    wiring.destroy();
  });
});
