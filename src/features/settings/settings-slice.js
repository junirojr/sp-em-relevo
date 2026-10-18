import { DEFAULT_HEIGHT_MODE } from "../../domain/height.js";
import { createSelector } from "../../domain/memo.js";

/**
 * Settings intent kept in the root state. The engine receives these through the selectors below;
 * the binding is done outside this slice.
 *
 * @typedef {import("../../domain/height.js").HeightMode} HeightMode
 * @typedef {"heat" | "selection" | "region"} ColorMode
 * @typedef {{
 *   heightMode: HeightMode,
 *   exaggeration: number,
 *   colorMode: ColorMode,
 *   isFramingOn: boolean,
 *   isTiltOn: boolean,
 *   viewAngleDegrees: number,
 *   isShadowOn: boolean,
 *   areBordersOn: boolean,
 *   isMotionReduced: boolean
 * }} SettingsState
 * @typedef {keyof SettingsState} SettingName
 * @typedef {{ type: "settings/changed", name: SettingName, value: unknown }} SettingChangedAction
 * @typedef {{ type: string }} Action
 * @typedef {{
 *   viewAngleDegrees: number,
 *   isTiltOn: boolean,
 *   isFramingOn: boolean,
 *   isMotionReduced: boolean
 * }} CameraSettings
 * @typedef {{ shadow: boolean, borders: boolean }} LightSettings
 */

export const SETTING_CHANGED = "settings/changed";

export const EXAGGERATION_MIN = 0.4;
export const EXAGGERATION_MAX = 2;
export const EXAGGERATION_STEP = 0.1;
export const VIEW_ANGLE_MIN = 5;
export const VIEW_ANGLE_MAX = 60;

const HEIGHT_MODES = ["data", "step", "flat"];
const COLOR_MODES = ["heat", "selection", "region"];

/**
 * Each normalizer returns the accepted value, or `undefined` when the input must be rejected.
 *
 * @type {Record<SettingName, (value: unknown) => unknown>}
 */
const NORMALIZERS = {
  heightMode: (value) => pickFrom(HEIGHT_MODES, value),
  exaggeration: normalizeExaggeration,
  colorMode: (value) => pickFrom(COLOR_MODES, value),
  isFramingOn: pickBoolean,
  isTiltOn: pickBoolean,
  viewAngleDegrees: normalizeViewAngle,
  isShadowOn: pickBoolean,
  areBordersOn: pickBoolean,
  isMotionReduced: pickBoolean,
};

/**
 * @returns {SettingsState}
 */
export function createSettingsState() {
  return {
    heightMode: DEFAULT_HEIGHT_MODE,
    exaggeration: 0.5,
    colorMode: "heat",
    isFramingOn: true,
    isTiltOn: true,
    viewAngleDegrees: 30,
    isShadowOn: true,
    areBordersOn: true,
    isMotionReduced: false,
  };
}

/**
 * Applies one setting change. Out-of-range numbers are clamped, unknown values are rejected, and
 * any action that changes nothing returns the same state reference.
 *
 * @param {SettingsState} state
 * @param {Action} action
 * @returns {SettingsState}
 */
export function reduceSettings(state, action) {
  if (!isSettingChange(action)) {
    return state;
  }
  const accepted = NORMALIZERS[action.name](action.value);
  if (accepted === undefined) {
    return state;
  }
  if (Object.is(state[action.name], accepted)) {
    return state;
  }
  return { ...state, [action.name]: accepted };
}

/** @param {unknown} mode */
export function changeHeightMode(mode) {
  return buildChange("heightMode", mode);
}

/** @param {unknown} value */
export function changeExaggeration(value) {
  return buildChange("exaggeration", value);
}

/** @param {unknown} mode */
export function changeColorMode(mode) {
  return buildChange("colorMode", mode);
}

/** @param {unknown} isOn */
export function changeFraming(isOn) {
  return buildChange("isFramingOn", isOn);
}

/** @param {unknown} isOn */
export function changeTilt(isOn) {
  return buildChange("isTiltOn", isOn);
}

/** @param {unknown} degrees */
export function changeViewAngle(degrees) {
  return buildChange("viewAngleDegrees", degrees);
}

/** @param {unknown} isOn */
export function changeShadow(isOn) {
  return buildChange("isShadowOn", isOn);
}

/** @param {unknown} isOn */
export function changeBorders(isOn) {
  return buildChange("areBordersOn", isOn);
}

/** @param {unknown} isOn */
export function changeMotionReduced(isOn) {
  return buildChange("isMotionReduced", isOn);
}

/**
 * Camera options in the names the engine uses. Same reference until one of them changes.
 *
 * @type {(state: SettingsState) => CameraSettings}
 */
export const selectCameraSettings = createSelector(
  [
    (state) => state.viewAngleDegrees,
    (state) => state.isTiltOn,
    (state) => state.isFramingOn,
    (state) => state.isMotionReduced,
  ],
  (viewAngleDegrees, isTiltOn, isFramingOn, isMotionReduced) => ({
    viewAngleDegrees,
    isTiltOn,
    isFramingOn,
    isMotionReduced,
  }),
);

/**
 * Shadow and borders in the names the engine uses. Same reference until one of them changes.
 *
 * @type {(state: SettingsState) => LightSettings}
 */
export const selectLightSettings = createSelector(
  [(state) => state.isShadowOn, (state) => state.areBordersOn],
  (shadow, borders) => ({ shadow, borders }),
);

/**
 * @param {SettingName} name
 * @param {unknown} value
 * @returns {SettingChangedAction}
 */
function buildChange(name, value) {
  return { type: SETTING_CHANGED, name, value };
}

/**
 * @param {Action} action
 * @returns {action is SettingChangedAction}
 */
function isSettingChange(action) {
  return action.type === SETTING_CHANGED;
}

/** @param {unknown} value */
function normalizeExaggeration(value) {
  if (!isFiniteNumber(value)) {
    return undefined;
  }
  const clamped = clamp(value, EXAGGERATION_MIN, EXAGGERATION_MAX);
  return Math.round(clamped / EXAGGERATION_STEP) / (1 / EXAGGERATION_STEP);
}

/** @param {unknown} value */
function normalizeViewAngle(value) {
  if (!isFiniteNumber(value)) {
    return undefined;
  }
  return Math.round(clamp(value, VIEW_ANGLE_MIN, VIEW_ANGLE_MAX));
}

/**
 * @param {readonly string[]} allowed
 * @param {unknown} value
 */
function pickFrom(allowed, value) {
  if (typeof value !== "string") {
    return undefined;
  }
  if (!allowed.includes(value)) {
    return undefined;
  }
  return value;
}

/** @param {unknown} value */
function pickBoolean(value) {
  if (typeof value !== "boolean") {
    return undefined;
  }
  return value;
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
