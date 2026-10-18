import assert from "node:assert/strict";
import { test } from "node:test";
import {
  changeLevel,
  createLevelState,
  LEVEL_CHANGED,
  LEVEL_GOVERNMENT_REGION,
  LEVEL_MUNICIPALITY,
  LEVEL_OPTIONS,
  LEVEL_REGION,
  reduceLevel,
  selectIsGovernmentRegionLevel,
  selectIsMunicipalityLevel,
  selectIsRegionLevel,
  selectLevelId,
} from "./level-slice.js";
import { buildLevelViewModel, mountLevelView } from "./level-view.js";

test("NIV-01 initial level state is municipality", () => {
  const state = createLevelState();
  assert.equal(selectLevelId(state), LEVEL_MUNICIPALITY);
  assert.equal(selectIsMunicipalityLevel(state), true);
  assert.equal(selectIsGovernmentRegionLevel(state), false);
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

test("RGV-03 changeLevel action switches to governmentRegion", () => {
  const initial = createLevelState();
  const toGov = reduceLevel(initial, changeLevel(LEVEL_GOVERNMENT_REGION));
  assert.equal(selectLevelId(toGov), LEVEL_GOVERNMENT_REGION);
  assert.equal(selectIsGovernmentRegionLevel(toGov), true);
  assert.equal(selectIsMunicipalityLevel(toGov), false);
  assert.equal(selectIsRegionLevel(toGov), false);

  const toRegion = reduceLevel(toGov, changeLevel(LEVEL_REGION));
  assert.equal(selectLevelId(toRegion), LEVEL_REGION);

  const backToGov = reduceLevel(toRegion, changeLevel(LEVEL_GOVERNMENT_REGION));
  assert.equal(selectLevelId(backToGov), LEVEL_GOVERNMENT_REGION);
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

test("RGV-03 level view model contains 'Ver por' three options: Município, Região de governo and Região administrativa", () => {
  const state = createLevelState();
  const model = buildLevelViewModel(state);
  assert.equal(model.title, "Ver por");
  assert.equal(model.currentLevelId, LEVEL_MUNICIPALITY);
  assert.equal(model.options.length, 3);
  assert.deepEqual(model.options, LEVEL_OPTIONS);
  assert.equal(model.options[0].id, LEVEL_MUNICIPALITY);
  assert.equal(model.options[1].id, LEVEL_GOVERNMENT_REGION);
  assert.equal(model.options[2].id, LEVEL_REGION);
});

test("RGV-04 level view explains RM São Paulo is equal to administrative region without duplicate radios", () => {
  const state = createLevelState();
  const model = buildLevelViewModel(state);
  assert.ok(model.explanatoryNote.includes("igual à região administrativa"));

  const radioIds = model.options.map((option) => option.id);
  const uniqueRadioIds = new Set(radioIds);
  assert.equal(radioIds.length, uniqueRadioIds.size, "Must not have duplicate radio options");

  const dispatched = [];
  const fakeDoc = {
    createElement(tag) {
      const children = [];
      const attrs = {};
      const listeners = {};
      return {
        tag,
        className: "",
        textContent: "",
        hidden: false,
        type: "",
        name: "",
        value: "",
        checked: false,
        append(...nodes) {
          children.push(...nodes);
        },
        setAttribute(k, v) {
          attrs[k] = v;
        },
        addEventListener(event, fn) {
          listeners[event] = fn;
        },
        trigger(event) {
          if (listeners[event]) {
            listeners[event]();
          }
        },
        children,
        attrs,
      };
    },
    createTextNode(text) {
      return { text };
    },
  };

  const view = mountLevelView(/** @type {any} */ (fakeDoc), (action) => dispatched.push(action));
  assert.ok(view.element);

  view.update({ id: LEVEL_GOVERNMENT_REGION });
  assert.equal(dispatched.length, 0);
});

test("NIV-08 level slice only manages level id and does not hold selection or camera state", () => {
  const state = createLevelState();
  const keys = Object.keys(state);
  assert.deepEqual(keys, ["id"]);
});
