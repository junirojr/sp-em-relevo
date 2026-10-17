import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attachProjection,
  bindToChange,
  createProjection,
  createRootSelectors,
} from "./projection.js";
import { changePointedUnit, createInitialState, reduceRootState } from "./state.js";
import { createStore } from "./store.js";

const SAO_PAULO = "3550308";
const CAMPINAS = "3509502";

/** @type {import("./state.js").LoadedData} */
const data = {
  municipalities: [
    {
      code: SAO_PAULO,
      name: "São Paulo",
      regionCode: "35901",
      population: 11451999,
      areaKm2: 1521.2,
      gdpThousandBrl: 828980607,
    },
    {
      code: CAMPINAS,
      name: "Campinas",
      regionCode: "35902",
      population: 1139047,
      areaKm2: 794.6,
      gdpThousandBrl: 70413195,
    },
  ],
  regions: [
    { code: "35901", label: "São Paulo" },
    { code: "35902", label: "Campinas" },
  ],
};

/** @type {import("./projection.js").ScaleRules} */
const scale = {
  toColorPositions: (values) => Uint8Array.from(values, (value) => Math.min(value / 1e6, 255)),
  toHeightTargets: (values) => Float32Array.from(values),
};

/**
 * @typedef {{ method: string, argument: unknown }} EngineCall
 */

function createFakeEngine() {
  /** @type {EngineCall[]} */
  const calls = [];
  /** @type {import("./projection.js").EnginePort} */
  const engine = {
    setHeightTargets: recordCall(calls, "setHeightTargets"),
    setColors: recordCall(calls, "setColors"),
    setRaised: recordCall(calls, "setRaised"),
  };
  return { engine, calls };
}

/**
 * @template Argument
 * @param {EngineCall[]} calls
 * @param {string} method
 * @returns {(argument: Argument) => void}
 */
function recordCall(calls, method) {
  return (argument) => {
    calls.push({ method, argument });
  };
}

/**
 * @param {import("./projection.js").ProjectionBinding[]} [views]
 */
function setUpProjectedStore(views = []) {
  const { engine, calls } = createFakeEngine();
  const selectors = createRootSelectors(scale);
  const store = createStore(reduceRootState, createInitialState(data));
  const project = createProjection({ engine, selectors, views });
  const detach = attachProjection(store, project);
  return { store, selectors, calls, project, detach };
}

/**
 * @param {EngineCall[]} calls
 */
function clearCalls(calls) {
  calls.length = 0;
}

/**
 * @param {import("./projection.js").RootSelectors} selectors
 * @param {import("./state.js").RootState} state
 */
function readAllSelectors(selectors, state) {
  return Object.entries(selectors).map(([name, select]) => ({ name, output: select(state) }));
}

test("BAS-05 attaching the projection sends heights, colors and raised units once each", () => {
  const { calls } = setUpProjectedStore();

  assert.deepEqual(
    calls.map((call) => call.method),
    ["setHeightTargets", "setColors", "setRaised"],
  );
  assert.deepEqual(calls[0].argument, Float32Array.from([11451999, 1139047]));
  assert.deepEqual(calls[2].argument, { pointed: null, selected: [] });
});

test("BAS-05 a dispatch whose reducer returns the same state keeps every selector reference and makes 0 engine calls", () => {
  const { store, selectors, calls, project } = setUpProjectedStore();
  const stateBefore = store.getState();
  const outputsBefore = readAllSelectors(selectors, stateBefore);
  clearCalls(calls);

  store.dispatch({ type: "test/ignoredByEverySlice" });
  project(store.getState());

  assert.equal(store.getState(), stateBefore);
  const outputsAfter = readAllSelectors(selectors, store.getState());
  for (const [index, before] of outputsBefore.entries()) {
    assert.equal(outputsAfter[index].output, before.output, `${before.name} changed reference`);
  }
  assert.equal(calls.length, 0);
});

test("BAS-05 a hover from A to B makes exactly 1 engine call, setRaised, and no setColors nor setHeightTargets", () => {
  const { store, calls } = setUpProjectedStore();
  store.dispatch(changePointedUnit(SAO_PAULO));
  clearCalls(calls);

  store.dispatch(changePointedUnit(CAMPINAS));

  assert.deepEqual(calls, [{ method: "setRaised", argument: { pointed: CAMPINAS, selected: [] } }]);
});

test("BAS-05 pointing at the unit already pointed keeps the state and makes 0 engine calls", () => {
  const { store, calls } = setUpProjectedStore();
  store.dispatch(changePointedUnit(SAO_PAULO));
  const stateBefore = store.getState();
  clearCalls(calls);

  store.dispatch(changePointedUnit(SAO_PAULO));

  assert.equal(store.getState(), stateBefore);
  assert.equal(calls.length, 0);
});

test("BAS-05 leaving the map clears the pointed unit with a single setRaised", () => {
  const { store, calls } = setUpProjectedStore();
  store.dispatch(changePointedUnit(SAO_PAULO));
  clearCalls(calls);

  store.dispatch(changePointedUnit(null));

  assert.deepEqual(calls, [{ method: "setRaised", argument: { pointed: null, selected: [] } }]);
});

test("BAS-05 pointing at a region code expands to its municipality codes in setRaised", () => {
  const { store, calls } = setUpProjectedStore();
  clearCalls(calls);

  store.dispatch(changePointedUnit("35901"));

  assert.deepEqual(calls, [
    { method: "setRaised", argument: { pointed: [SAO_PAULO], selected: [] } },
  ]);
});

test("BAS-05 a view runs only when its own input changes", () => {
  /** @type {unknown[]} */
  const renderedValues = [];
  const selectors = createRootSelectors(scale);
  const legendView = bindToChange(selectors.selectIndicatorValues, (values) => {
    renderedValues.push(values);
  });
  const { store } = setUpProjectedStore([legendView]);

  store.dispatch(changePointedUnit(SAO_PAULO));
  store.dispatch(changePointedUnit(CAMPINAS));

  assert.equal(renderedValues.length, 1);
  assert.deepEqual(renderedValues[0], Float64Array.from([11451999, 1139047]));
});

test("BAS-05 detaching the projection stops engine calls", () => {
  const { store, calls, detach } = setUpProjectedStore();
  clearCalls(calls);

  detach();
  store.dispatch(changePointedUnit(SAO_PAULO));

  assert.equal(calls.length, 0);
});
