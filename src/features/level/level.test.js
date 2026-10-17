import assert from "node:assert/strict";
import { test } from "node:test";
import {
  changeLevel,
  createLevelState,
  LEVEL_CHANGED,
  LEVEL_MUNICIPALITY,
  LEVEL_OPTIONS,
  LEVEL_REGION,
  reduceLevel,
  selectIsMunicipalityLevel,
  selectIsRegionLevel,
  selectLevelId,
} from "./level-slice.js";
import { buildLevelViewModel } from "./level-view.js";

test("NIV-01 initial level state is municipality", () => {
  const state = createLevelState();
  assert.equal(selectLevelId(state), LEVEL_MUNICIPALITY);
  assert.equal(selectIsMunicipalityLevel(state), true);
  assert.equal(selectIsRegionLevel(state), false);
});

test("NIV-01 changeLevel action switches between municipality and region", () => {
  const initial = createLevelState();
  const toRegion = reduceLevel(initial, changeLevel(LEVEL_REGION));
  assert.equal(selectLevelId(toRegion), LEVEL_REGION);
  assert.equal(selectIsMunicipalityLevel(toRegion), false);
  assert.equal(selectIsRegionLevel(toRegion), true);

  const backToMun = reduceLevel(toRegion, changeLevel(LEVEL_MUNICIPALITY));
  assert.equal(selectLevelId(backToMun), LEVEL_MUNICIPALITY);
  assert.equal(selectIsMunicipalityLevel(backToMun), true);
});

test("NIV-01 unknown level id is rejected and returns the same state reference", () => {
  const initial = createLevelState();
  const invalid = reduceLevel(initial, {
    type: LEVEL_CHANGED,
    id: /** @type {any} */ ("country"),
  });
  assert.equal(invalid, initial);
});

test("NIV-01 dispatching current level returns the same state reference", () => {
  const initial = createLevelState();
  const same = reduceLevel(initial, changeLevel(LEVEL_MUNICIPALITY));
  assert.equal(same, initial);
});

test("NIV-01 level view model contains 'Ver por' options: Município and Região administrativa", () => {
  const state = createLevelState();
  const model = buildLevelViewModel(state);
  assert.equal(model.title, "Ver por");
  assert.equal(model.currentLevelId, LEVEL_MUNICIPALITY);
  assert.equal(model.options.length, 2);
  assert.deepEqual(model.options, LEVEL_OPTIONS);
});

test("NIV-08 level slice only manages level id and does not hold selection or camera state", () => {
  const state = createLevelState();
  const keys = Object.keys(state);
  assert.deepEqual(keys, ["id"]);
});
