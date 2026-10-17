import { HEAT_BAND_COUNT, readLogPosition } from "./classification.js";

/**
 * Height target calculation from continuous logarithmic value positions (mode "data") or from
 * the heat band alone (mode "step", ESC-10). Supports flat height mode and the height
 * exaggeration factor.
 *
 * @typedef {"data" | "step" | "flat"} HeightMode
 * @typedef {{
 *   heightMode?: HeightMode,
 *   exaggeration?: number,
 *   gain?: number
 * }} HeightOptions
 */

export const BASE_HEIGHT = 1;
export const DEFAULT_HEIGHT_GAIN = 9;
export const DEFAULT_EXAGGERATION = 0.5;
/** @type {HeightMode} */
export const DEFAULT_HEIGHT_MODE = "data";

/**
 * Computes the target elevation scale for a single value.
 * In flat mode, returns base height 1. In data mode, returns 1 plus
 * the gain multiplied by exaggeration and continuous log position.
 * Mode "step" needs the heat band of the value, so it has its own entry point,
 * `computeStepHeight`; this function does not branch on it.
 *
 * @param {number | null | undefined} value
 * @param {number} min positive minimum
 * @param {number} max positive maximum
 * @param {HeightOptions} [options]
 * @returns {number}
 */
export function computeTargetHeight(value, min, max, options = {}) {
  if (options.heightMode === "flat") {
    return BASE_HEIGHT;
  }
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return BASE_HEIGHT;
  }
  const logPosition = readLogPosition(value, min, max);

  return BASE_HEIGHT + resolveElevationSpan(options) * logPosition;
}

/**
 * Computes the target elevation scale for a unit in the "step" height mode (ESC-10).
 * The height depends only on the heat band: band i (1 to 7) rises i/7 of the proportional
 * elevation span above the base, with the same exaggeration, so band 1 stands above the flat
 * mode and band 7 meets the proportional maximum. Units in the same band stand equally tall and
 * the seven heights strictly increase.
 *
 * @param {number} classIndex heat band index from 0 to 6, as `classify` returns it.
 * @param {HeightOptions} [options] uses `exaggeration` and `gain`, like the proportional mode.
 * @returns {number} base height 1 when the unit has no band (index -1 or out of range).
 */
export function computeStepHeight(classIndex, options = {}) {
  if (!isHeatBandIndex(classIndex)) {
    return BASE_HEIGHT;
  }
  const bandNumber = classIndex + 1;

  return BASE_HEIGHT + (bandNumber / HEAT_BAND_COUNT) * resolveElevationSpan(options);
}

/**
 * Computes the step height of every unit, preserving instance order.
 *
 * @param {ArrayLike<number>} classIndexes heat band index per unit, 0 to 6, or -1 when missing.
 * @param {HeightOptions} [options]
 * @returns {Float32Array}
 */
export function computeStepHeightTargets(classIndexes, options = {}) {
  const result = new Float32Array(classIndexes.length);
  for (let i = 0; i < classIndexes.length; i += 1) {
    result[i] = computeStepHeight(classIndexes[i], options);
  }
  return result;
}

/**
 * Computes an array of height targets for a collection of values,
 * preserving instance order.
 *
 * @param {ArrayLike<number | null | undefined>} values
 * @param {number} [min]
 * @param {number} [max]
 * @param {HeightOptions} [options]
 * @returns {Float32Array}
 */
export function computeHeightTargets(values, min, max, options = {}) {
  const bounds = resolveBounds(values, min, max);
  const result = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    result[i] = computeTargetHeight(values[i], bounds.min, bounds.max, options);
  }
  return result;
}

/**
 * Finds the positive minimum and maximum in a collection of numbers.
 *
 * @param {ArrayLike<number | null | undefined>} values
 * @returns {{ min: number, max: number }}
 */
export function findPositiveBounds(values) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i += 1) {
    const val = values[i];
    if (val !== null && val !== undefined && Number.isFinite(val) && val > 0) {
      if (val < min) {
        min = val;
      }
      if (val > max) {
        max = val;
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 1, max: 1 };
  }
  return { min, max };
}

/**
 * @param {ArrayLike<number | null | undefined>} values
 * @param {number | undefined} min
 * @param {number | undefined} max
 * @returns {{ min: number, max: number }}
 */
function resolveBounds(values, min, max) {
  if (min !== undefined && max !== undefined) {
    return { min, max };
  }
  return findPositiveBounds(values);
}

/**
 * @param {number} classIndex
 * @returns {boolean}
 */
function isHeatBandIndex(classIndex) {
  if (!Number.isInteger(classIndex)) {
    return false;
  }
  if (classIndex < 0) {
    return false;
  }
  return classIndex < HEAT_BAND_COUNT;
}

/**
 * How much the proportional mode lifts a unit above the base height at the top of the log scale.
 *
 * @param {HeightOptions} options
 * @returns {number}
 */
function resolveElevationSpan(options) {
  const gain = resolveOptionNumber(options.gain, DEFAULT_HEIGHT_GAIN);
  const exaggeration = resolveOptionNumber(options.exaggeration, DEFAULT_EXAGGERATION);

  return gain * exaggeration;
}

/**
 * @param {number | undefined} candidate
 * @param {number} fallback
 * @returns {number}
 */
function resolveOptionNumber(candidate, fallback) {
  if (candidate === undefined || Number.isNaN(candidate)) {
    return fallback;
  }
  return candidate;
}
