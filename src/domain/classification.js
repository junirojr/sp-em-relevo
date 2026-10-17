/**
 * Classification into 7 heat bands and continuous logarithmic positioning.
 * Follows P36 (geometric log for municipalities, quantile for regions) and R11
 * (2 significant digits rounding, 3 when needed to keep strictly increasing breaks
 * or avoid crossing members).
 *
 * @typedef {"municipality" | "region"} TerritorialLevel
 */

export const HEAT_BAND_COUNT = 7;
export const REGION_BAND_SIZES = [2, 3, 2, 2, 2, 3, 2];

/**
 * Assigns a numeric value to a heat band index from 0 to breaks.length.
 * Follows ESC-02: band i is [q(i), q(i+1)). A value equal to the break falls
 * into the upper band; a value below falls into the lower band.
 *
 * @param {number | null | undefined} value
 * @param {number[]} breaks strictly increasing array of 6 breaks
 * @returns {number} band index from 0 to 6, or -1 when value is absent or non-positive
 */
export function classify(value, breaks) {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return -1;
  }
  for (let i = 0; i < breaks.length; i += 1) {
    if (value < breaks[i]) {
      return i;
    }
  }
  return breaks.length;
}

/**
 * Computes 6 classification breaks for a collection of values at a given level.
 *
 * @param {ArrayLike<number | null | undefined>} values
 * @param {TerritorialLevel} level
 * @returns {number[]} array of 6 strictly increasing breaks
 */
export function computeBreaks(values, level) {
  if (level === "region") {
    return computeQuantileBreaks(values, REGION_BAND_SIZES);
  }
  const bounds = findPositiveRange(values);
  return computeGeometricBreaks(bounds.min, bounds.max, HEAT_BAND_COUNT);
}

/**
 * Computes geometric log breaks between min and max.
 * For 7 bands, returns 6 breaks rounded according to R11.
 *
 * @param {number} min positive minimum
 * @param {number} max positive maximum
 * @param {number} [bandCount] default 7
 * @returns {number[]} strictly increasing breaks
 */
export function computeGeometricBreaks(min, max, bandCount = HEAT_BAND_COUNT) {
  if (min <= 0 || max <= min || bandCount < 2) {
    return [];
  }
  const ratio = (max / min) ** (1 / bandCount);
  const breakCount = bandCount - 1;
  const rawBreaks = [];
  for (let i = 1; i <= breakCount; i += 1) {
    rawBreaks.push(min * ratio ** i);
  }
  const rounded2 = rawBreaks.map((b) => roundSignificant(b, 2));
  if (isStrictlyIncreasing(rounded2)) {
    return rounded2;
  }
  return rawBreaks.map((b) => roundSignificant(b, 3));
}

/**
 * Computes quantile breaks for the region level.
 * Each break is the geometric mean between the last item of a band and the first
 * item of the next band, rounded to 2 significant digits (or 3 if rounding crosses
 * a member or causes duplicate breaks).
 *
 * @param {ArrayLike<number | null | undefined>} values
 * @param {number[]} [bandSizes] partition sizes, defaults to [2, 3, 2, 2, 2, 3, 2]
 * @returns {number[]} strictly increasing breaks
 */
export function computeQuantileBreaks(values, bandSizes = REGION_BAND_SIZES) {
  const sorted = extractSortedPositiveValues(values);
  const boundaryPairs = buildBoundaryPairs(bandSizes);
  const breaks = [];

  for (let b = 0; b < boundaryPairs.length; b += 1) {
    const pair = boundaryPairs[b];
    const leftVal = sorted[pair.left];
    const rightVal = sorted[pair.right];
    if (leftVal === undefined || rightVal === undefined) {
      break;
    }
    const raw = Math.sqrt(leftVal * rightVal);
    let rounded = roundSignificant(raw, 2);
    if (rounded <= leftVal || rounded >= rightVal) {
      rounded = roundSignificant(raw, 3);
    }
    if (breaks.length > 0 && rounded <= breaks[breaks.length - 1]) {
      rounded = roundSignificant(raw, 3);
    }
    breaks.push(rounded);
  }

  return breaks;
}

/**
 * Continuous logarithmic position between min and max, normalized to [0, 1].
 *
 * @param {number | null | undefined} value
 * @param {number} min positive minimum
 * @param {number} max positive maximum
 * @returns {number} position between 0 and 1
 */
export function readLogPosition(value, min, max) {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (min <= 0 || max <= min) {
    return 0;
  }
  if (value <= min) {
    return 0;
  }
  if (value >= max) {
    return 1;
  }
  const position = (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
  if (position <= 0) {
    return 0;
  }
  if (position >= 1) {
    return 1;
  }
  return position;
}

/**
 * Rounds a positive number to a specified number of significant digits.
 *
 * @param {number} value
 * @param {number} [digits] default 2
 * @returns {number}
 */
export function roundSignificant(value, digits = 2) {
  if (value === 0 || !Number.isFinite(value)) {
    return 0;
  }
  return Number.parseFloat(value.toPrecision(digits));
}

/**
 * @param {ArrayLike<number | null | undefined>} values
 * @returns {{ min: number, max: number }}
 */
function findPositiveRange(values) {
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
 * @returns {number[]}
 */
function extractSortedPositiveValues(values) {
  const result = [];
  for (let i = 0; i < values.length; i += 1) {
    const val = values[i];
    if (val !== null && val !== undefined && Number.isFinite(val) && val > 0) {
      result.push(val);
    }
  }
  result.sort((a, b) => a - b);
  return result;
}

/**
 * @param {number[]} bandSizes
 * @returns {Array<{ left: number, right: number }>}
 */
function buildBoundaryPairs(bandSizes) {
  const pairs = [];
  let cumulative = 0;
  for (let i = 0; i < bandSizes.length - 1; i += 1) {
    cumulative += bandSizes[i];
    pairs.push({
      left: cumulative - 1,
      right: cumulative,
    });
  }
  return pairs;
}

/**
 * @param {number[]} array
 * @returns {boolean}
 */
function isStrictlyIncreasing(array) {
  for (let i = 1; i < array.length; i += 1) {
    if (array[i] <= array[i - 1]) {
      return false;
    }
  }
  return true;
}
