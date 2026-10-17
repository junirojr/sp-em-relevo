import {
  classify,
  HEAT_BAND_COUNT as DOMAIN_HEAT_BAND_COUNT,
  computeBreaks as domainComputeBreaks,
} from "../../domain/classification.js";
import { formatAbbreviated } from "../../domain/format.js";
import {
  computeHeightTargets as domainComputeHeightTargets,
  computeStepHeightTargets as domainComputeStepHeightTargets,
} from "../../domain/height.js";

/**
 * @typedef {import("../../domain/classification.js").TerritorialLevel} TerritorialLevel
 */

export const HEAT_BAND_COUNT = DOMAIN_HEAT_BAND_COUNT;

/**
 * Computes the 6 heat breaks for a given level and array of values.
 *
 * @param {ArrayLike<number | null | undefined>} values
 * @param {TerritorialLevel} level
 * @returns {number[]}
 */
export function selectBreaks(values, level) {
  return domainComputeBreaks(values, level);
}

/**
 * Selects the 0..6 heat band index for a single value.
 *
 * @param {number | null | undefined} value
 * @param {number[]} breaks
 * @returns {number}
 */
export function selectClassIndex(value, breaks) {
  return classify(value, breaks);
}

/**
 * Computes heat band indexes (0..6, or -1 for missing) for an array of values.
 *
 * @param {ArrayLike<number | null | undefined>} values
 * @param {number[]} breaks
 * @returns {Int8Array}
 */
export function selectClassIndexes(values, breaks) {
  const result = new Int8Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    result[i] = classify(values[i], breaks);
  }
  return result;
}

/**
 * Computes height targets as Float32Array for an array of values.
 *
 * @param {ArrayLike<number | null | undefined>} values
 * @param {number} [min]
 * @param {number} [max]
 * @param {import("../../domain/height.js").HeightOptions} [options]
 * @returns {Float32Array}
 */
export function selectHeightTargets(values, min, max, options) {
  return domainComputeHeightTargets(values, min, max, options);
}

/**
 * Computes the "step" height targets (ESC-10): one height per heat band, taken from the same
 * breaks that paint the map, so a unit stands as tall as its color says.
 *
 * @param {ArrayLike<number | null | undefined>} values
 * @param {number[]} breaks the 6 breaks of the level, from `selectBreaks`.
 * @param {import("../../domain/height.js").HeightOptions} [options] `exaggeration` and `gain`.
 * @returns {Float32Array} 1 for units without a band (missing or non-positive value).
 */
export function selectStepHeightTargets(values, breaks, options) {
  const classIndexes = selectClassIndexes(values, breaks);
  return domainComputeStepHeightTargets(classIndexes, options);
}

/**
 * Formats a single heat band label in abbreviated pt-BR.
 * Follows ESC-05 ("Até 50 mil", "50 mil a 200 mil", "Mais de 2 mi").
 *
 * @param {number} bandIndex 0 to 6
 * @param {number[]} breaks 6 strictly increasing breaks
 * @param {string} indicatorId
 * @returns {string}
 */
export function formatBandLabel(bandIndex, breaks, indicatorId) {
  if (bandIndex === 0) {
    const top = formatAbbreviated(breaks[0], indicatorId);
    return `Até ${top}`;
  }

  if (bandIndex >= breaks.length) {
    const bottom = formatAbbreviated(breaks[breaks.length - 1], indicatorId);
    return `Mais de ${bottom}`;
  }

  const start = formatAbbreviated(breaks[bandIndex - 1], indicatorId);
  const end = formatAbbreviated(breaks[bandIndex], indicatorId);
  return `${start} a ${end}`;
}

/**
 * Builds all 7 heat band labels.
 *
 * @param {number[]} breaks
 * @param {string} indicatorId
 * @returns {string[]}
 */
export function buildBandLabels(breaks, indicatorId) {
  const labels = [];
  for (let i = 0; i < HEAT_BAND_COUNT; i += 1) {
    labels.push(formatBandLabel(i, breaks, indicatorId));
  }
  return labels;
}

/**
 * Checks whether an array of values has missing, null, undefined or non-positive entries.
 *
 * @param {ArrayLike<number | null | undefined>} values
 * @returns {boolean}
 */
export function hasMissingValues(values) {
  for (let i = 0; i < values.length; i += 1) {
    const val = values[i];
    if (val === null || val === undefined || Number.isNaN(val) || val <= 0) {
      return true;
    }
  }
  return false;
}
