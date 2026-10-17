import assert from "node:assert/strict";
import { test } from "node:test";
import {
  changeDrawNumber,
  createDemoState,
  DEFAULT_DRAW_NUMBER,
  DISABLED_INDICATOR_REASON,
  disableDemo,
  enableDemo,
  MAX_DRAW_NUMBER,
  MIN_DRAW_NUMBER,
  normalizeDrawNumber,
  pickRandomDrawNumber,
  reduceDemo,
  selectDemoIndicator,
  selectDisabledIndicatorReason,
  selectDrawNumber,
  selectIsDemoActive,
} from "./demo-slice.js";
import {
  buildDemoSettingsViewModel,
  buildIndicatorNoticeViewModel,
  buildStageBannerViewModel,
} from "./demo-view.js";

test("DEM-01 initial demo state is inactive with default draw number", () => {
  const state = createDemoState();
  assert.equal(selectIsDemoActive(state), false);
  assert.equal(selectDrawNumber(state), DEFAULT_DRAW_NUMBER);
  assert.equal(selectDemoIndicator(state), null);
  assert.equal(selectDisabledIndicatorReason(state), null);
});

test("DEM-01 enabling demo sets isActive and receives the draw number in the action", () => {
  const initial = createDemoState();
  const enabled = reduceDemo(initial, enableDemo(42));
  assert.equal(selectIsDemoActive(enabled), true);
  assert.equal(selectDrawNumber(enabled), 42);
  const indicator = selectDemoIndicator(enabled);
  assert.ok(indicator !== null);
  assert.equal(indicator.id, "synthetic");
  assert.equal(indicator.label, "Valor sintético");
  assert.equal(indicator.aggregation.type, "sum");
  assert.equal(selectDisabledIndicatorReason(enabled), DISABLED_INDICATOR_REASON);
});

test("DEM-01 indicator notice view model shows reason when demo is active", () => {
  const inactiveState = createDemoState();
  const activeState = reduceDemo(inactiveState, enableDemo(10));
  const inactiveModel = buildIndicatorNoticeViewModel(inactiveState);
  assert.equal(inactiveModel.isVisible, false);
  assert.equal(inactiveModel.reason, "");

  const activeModel = buildIndicatorNoticeViewModel(activeState);
  assert.equal(activeModel.isVisible, true);
  assert.equal(activeModel.reason, "Dado sintético ativo");
});

test("DEM-02 stage banner shows 'Dado sintético' and 'Voltar ao dado real' when demo is active", () => {
  const inactiveState = createDemoState();
  const activeState = reduceDemo(inactiveState, enableDemo(10));
  const inactiveModel = buildStageBannerViewModel(inactiveState);
  assert.equal(inactiveModel.isVisible, false);

  const activeModel = buildStageBannerViewModel(activeState);
  assert.equal(activeModel.isVisible, true);
  assert.equal(activeModel.title, "Dado sintético");
  assert.equal(activeModel.buttonText, "Voltar ao dado real");
});

test("DEM-04 disabling demo flips isActive to false while preserving draw number", () => {
  const initial = createDemoState();
  const active = reduceDemo(initial, enableDemo(777));
  const disabled = reduceDemo(active, disableDemo());
  assert.equal(selectIsDemoActive(disabled), false);
  assert.equal(selectDrawNumber(disabled), 777);
  assert.equal(selectDemoIndicator(disabled), null);
  assert.equal(selectDisabledIndicatorReason(disabled), null);
});

test("DEM-04 draw number is clamped to 1..99999 and truncated to integer", () => {
  assert.equal(normalizeDrawNumber(1), 1);
  assert.equal(normalizeDrawNumber(99999), 99999);
  assert.equal(normalizeDrawNumber(500.8), 500);
  assert.equal(normalizeDrawNumber(0), null);
  assert.equal(normalizeDrawNumber(-10), null);
  assert.equal(normalizeDrawNumber(100000), null);
  assert.equal(normalizeDrawNumber(Number.NaN), null);
  assert.equal(normalizeDrawNumber("10"), null);
});

test("DEM-04 changing draw number in demo state validates number range", () => {
  const initial = createDemoState();
  const changed = reduceDemo(initial, changeDrawNumber(12345));
  assert.equal(selectDrawNumber(changed), 12345);

  const rejected = reduceDemo(initial, changeDrawNumber(999999));
  assert.equal(selectDrawNumber(rejected), DEFAULT_DRAW_NUMBER);
});

test("DEM-04 pickRandomDrawNumber returns an integer between 1 and 99999", () => {
  for (let i = 0; i < 20; i += 1) {
    const draw = pickRandomDrawNumber();
    assert.ok(Number.isInteger(draw));
    assert.ok(draw >= MIN_DRAW_NUMBER);
    assert.ok(draw <= MAX_DRAW_NUMBER);
  }
});

test("DEM-01 demo settings view model reports control state accurately", () => {
  const state = reduceDemo(createDemoState(), enableDemo(55));
  const model = buildDemoSettingsViewModel(state);
  assert.equal(model.isActive, true);
  assert.equal(model.drawNumber, 55);
  assert.equal(model.minDraw, 1);
  assert.equal(model.maxDraw, 99999);
});
