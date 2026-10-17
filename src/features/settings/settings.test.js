import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAppearanceViewModel } from "./appearance-view.js";
import { buildMeasurementRows } from "./measurements-view.js";
import {
  changeBorders,
  changeColorMode,
  changeExaggeration,
  changeFraming,
  changeHeightMode,
  changeMotionReduced,
  changeShadow,
  changeTilt,
  changeViewAngle,
  createSettingsState,
  reduceSettings,
  selectCameraSettings,
  selectLightSettings,
} from "./settings-slice.js";
import {
  buildSettingsViewModel,
  formatExaggeration,
  isCloseKey,
  toggleExpanded,
} from "./settings-view.js";

test("CFG-05 initial state: height as data, 0.5x, heat color", () => {
  const state = createSettingsState();
  assert.equal(state.heightMode, "data");
  assert.equal(state.exaggeration, 0.5);
  assert.equal(state.colorMode, "heat");
});

test("CFG-04 initial state: angle 30, tilt, framing, shadow, borders on, motion not reduced", () => {
  const state = createSettingsState();
  assert.equal(state.viewAngleDegrees, 30);
  assert.equal(state.isTiltOn, true);
  assert.equal(state.isFramingOn, true);
  assert.equal(state.isShadowOn, true);
  assert.equal(state.areBordersOn, true);
  assert.equal(state.isMotionReduced, false);
});

test("CFG-05 exaggeration is clamped to 0.4..2 and rounded to the 0.1 step", () => {
  const initial = createSettingsState();
  assert.equal(reduceSettings(initial, changeExaggeration(0.1)).exaggeration, 0.4);
  assert.equal(reduceSettings(initial, changeExaggeration(9)).exaggeration, 2);
  assert.equal(reduceSettings(initial, changeExaggeration(1.04)).exaggeration, 1);
  assert.equal(reduceSettings(initial, changeExaggeration(0.7)).exaggeration, 0.7);
});

test("CFG-05 exaggeration rejects values that are not finite numbers", () => {
  const initial = createSettingsState();
  assert.equal(reduceSettings(initial, changeExaggeration(Number.NaN)), initial);
  assert.equal(reduceSettings(initial, changeExaggeration("1.5")), initial);
});

test("CFG-04 view angle is clamped to 5..60 and rounded to whole degrees", () => {
  const initial = createSettingsState();
  assert.equal(reduceSettings(initial, changeViewAngle(1)).viewAngleDegrees, 5);
  assert.equal(reduceSettings(initial, changeViewAngle(80)).viewAngleDegrees, 60);
  assert.equal(reduceSettings(initial, changeViewAngle(44.6)).viewAngleDegrees, 45);
});

test("CFG-05 height mode and color mode accept only known values", () => {
  const initial = createSettingsState();
  assert.equal(reduceSettings(initial, changeHeightMode("flat")).heightMode, "flat");
  assert.equal(reduceSettings(initial, changeColorMode("selection")).colorMode, "selection");
  assert.equal(reduceSettings(initial, changeHeightMode("tall")), initial);
  assert.equal(reduceSettings(initial, changeColorMode("red")), initial);
});

test("CFG-05 height mode accepts the step value and keeps data as the default", () => {
  const initial = createSettingsState();
  const stepped = reduceSettings(initial, changeHeightMode("step"));
  assert.equal(initial.heightMode, "data");
  assert.equal(stepped.heightMode, "step");
  assert.equal(reduceSettings(stepped, changeHeightMode("step")), stepped);
  assert.equal(reduceSettings(stepped, changeHeightMode("data")).heightMode, "data");
  assert.equal(reduceSettings(stepped, changeHeightMode("flat")).heightMode, "flat");
});

test("CFG-05 height mode still rejects names that are not data, step or flat", () => {
  const stepped = reduceSettings(createSettingsState(), changeHeightMode("step"));
  assert.equal(reduceSettings(stepped, changeHeightMode("Step")), stepped);
  assert.equal(reduceSettings(stepped, changeHeightMode("stairs")), stepped);
  assert.equal(reduceSettings(stepped, changeHeightMode(null)), stepped);
  assert.equal(reduceSettings(stepped, changeHeightMode(2)), stepped);
});

test("CFG-05 exaggeration control is disabled with flat height only, not with step", () => {
  const stepped = reduceSettings(createSettingsState(), changeHeightMode("step"));
  assert.equal(buildAppearanceViewModel(stepped).isExaggerationDisabled, false);
  assert.equal(buildAppearanceViewModel(stepped).heightMode, "step");
});

test("CFG-04 toggles update their own flag only", () => {
  const initial = createSettingsState();
  assert.equal(reduceSettings(initial, changeTilt(false)).isTiltOn, false);
  assert.equal(reduceSettings(initial, changeFraming(false)).isFramingOn, false);
  assert.equal(reduceSettings(initial, changeShadow(false)).isShadowOn, false);
  assert.equal(reduceSettings(initial, changeBorders(false)).areBordersOn, false);
  assert.equal(reduceSettings(initial, changeMotionReduced(true)).isMotionReduced, true);
  assert.equal(reduceSettings(initial, changeTilt("no")), initial);
});

test("CFG-04 a change that keeps the value returns the same state reference", () => {
  const initial = createSettingsState();
  assert.equal(reduceSettings(initial, changeViewAngle(30)), initial);
  assert.equal(reduceSettings(initial, changeTilt(true)), initial);
});

test("CFG-06 an action from another slice returns the same state reference", () => {
  const initial = createSettingsState();
  assert.equal(reduceSettings(initial, { type: "pointer/pointedUnitChanged" }), initial);
});

test("CFG-04 camera selector hands the engine its option names", () => {
  const state = reduceSettings(createSettingsState(), changeViewAngle(45));
  assert.deepEqual(selectCameraSettings(state), {
    viewAngleDegrees: 45,
    isTiltOn: true,
    isFramingOn: true,
    isMotionReduced: false,
  });
});

test("CFG-03 light selector hands the engine shadow and borders", () => {
  const state = reduceSettings(createSettingsState(), changeShadow(false));
  assert.deepEqual(selectLightSettings(state), { shadow: false, borders: true });
});

test("CFG-04 selectors keep their reference while their inputs are unchanged", () => {
  const initial = createSettingsState();
  const cameraBefore = selectCameraSettings(initial);
  const lightBefore = selectLightSettings(initial);
  const next = reduceSettings(initial, changeShadow(false));
  assert.equal(selectCameraSettings(next), cameraBefore);
  assert.notEqual(selectLightSettings(next), lightBefore);
});

test("CFG-05 exaggeration is formatted with a decimal comma", () => {
  assert.equal(formatExaggeration(0.5), "0,5x");
  assert.equal(formatExaggeration(2), "2x");
  assert.equal(formatExaggeration(1.3), "1,3x");
});

test("CFG-05 exaggeration control is disabled with flat height", () => {
  const flat = reduceSettings(createSettingsState(), changeHeightMode("flat"));
  assert.equal(buildAppearanceViewModel(flat).isExaggerationDisabled, true);
  assert.equal(buildAppearanceViewModel(createSettingsState()).isExaggerationDisabled, false);
});

test("CFG-06 view model carries the store values so controls are born with them", () => {
  const state = reduceSettings(createSettingsState(), changeViewAngle(12));
  const settingsViewModel = buildSettingsViewModel(state);
  const appearanceViewModel = buildAppearanceViewModel(state);
  assert.equal(settingsViewModel.viewAngleText, "12°");
  assert.equal(appearanceViewModel.exaggerationText, "0,5x");
  assert.equal(appearanceViewModel.heightMode, "data");
  assert.equal(appearanceViewModel.colorMode, "heat");
});

test("CFG-01 the panel starts collapsed and the toggle flips it", () => {
  assert.equal(toggleExpanded(false), true);
  assert.equal(toggleExpanded(true), false);
});

test("CFG-02 only Escape closes the panel", () => {
  assert.equal(isCloseKey("Escape"), true);
  assert.equal(isCloseKey("Enter"), false);
});

test("CFG-04 measurements list the five rows in order", () => {
  const rows = buildMeasurementRows({
    buildMilliseconds: 12.34,
    vertexCount: 120000,
    drawCalls: 4,
    triangles: 98000,
    medianFrameMilliseconds: 1.26,
  });
  assert.deepEqual(
    rows.map((row) => row.label),
    [
      "Montagem da geometria",
      "Vértices do bloco",
      "Chamadas de desenho por quadro",
      "Triângulos por quadro",
      "CPU por quadro, mediana",
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.text),
    ["12,3 ms", "120.000", "4", "98.000", "1,3 ms"],
  );
});

test("CFG-04 measurements show an ellipsis for numbers not read yet", () => {
  const rows = buildMeasurementRows({
    buildMilliseconds: null,
    vertexCount: null,
    drawCalls: null,
    triangles: null,
    medianFrameMilliseconds: null,
  });
  assert.ok(rows.every((row) => row.text === "…"));
});
