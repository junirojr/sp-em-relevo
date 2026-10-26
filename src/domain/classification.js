/**
 * Classification into 7 heat bands and continuous logarithmic positioning.
 * Follows P36 (geometric log for municipalities, quantile for regions) and R11
 * (2 significant digits rounding, 3 when needed to keep strictly increasing breaks
 * or avoid crossing members).
 *
 * @typedef {"municipality" | "governmentRegion" | "region"} TerritorialLevel
 */

export const HEAT_BAND_COUNT = 7;
export const REGION_BAND_SIZES = [2, 3, 2, 2, 2, 3, 2];
export const REGION_COLOR_COUNT = 16;

/**
 * 16 categorical low-chroma colors for administrative regions in light theme (REG-02).
 * Each color has OKLab chroma < 0.08 (lower than candidate colors) and maintains
 * perceptual distance under colorblind simulation (protanopia, deuteranopia, tritanopia).
 */
export const REGION_COLORS_LIGHT = [
  "#d8a29c",
  "#8d5b42",
  "#ccaa84",
  "#786833",
  "#afb687",
  "#547348",
  "#8dbea3",
  "#2d776d",
  "#7fbec5",
  "#33718b",
  "#92b5d9",
  "#5a6694",
  "#b3a9d7",
  "#7b5b85",
  "#cea1be",
  "#8d5665",
];

/**
 * 16 categorical low-chroma colors for administrative regions in dark theme (REG-02).
 */
export const REGION_COLORS_DARK = [
  "#d19b96",
  "#86563d",
  "#c6a47e",
  "#72622d",
  "#a9b081",
  "#4e6d42",
  "#87b89d",
  "#267167",
  "#78b7be",
  "#2d6c85",
  "#8cafd3",
  "#55608e",
  "#ada3d0",
  "#75557f",
  "#c89bb8",
  "#87515f",
];

export const REGION_PALETTES = {
  light: REGION_COLORS_LIGHT,
  dark: REGION_COLORS_DARK,
};

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

/**
 * Resolves the categorical color for an administrative region code (1..16) (REG-02).
 *
 * @param {string | number | null | undefined} regionCode
 * @param {"light" | "dark"} [theme]
 * @returns {string}
 */
export function getRegionColor(regionCode, theme = "light") {
  const palette = resolveRegionPalette(theme);
  const parsed = Number.parseInt(String(regionCode ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > REGION_COLOR_COUNT) {
    return "#888888";
  }
  return palette[parsed - 1];
}

/**
 * Maps each municipality record by its region code to its respective hex color (REG-02).
 *
 * @param {ArrayLike<any>} municipalities
 * @param {"light" | "dark"} [theme]
 * @returns {string[]}
 */
export function classifyRegionColors(municipalities, theme = "light") {
  const result = [];
  for (let i = 0; i < municipalities.length; i += 1) {
    const item = municipalities[i];
    const code = readMunicipalityRegionCode(item);
    result.push(getRegionColor(code, theme));
  }
  return result;
}

/**
 * Computes OKLab chroma for a given hex color string (REG-02).
 *
 * @param {string} hex
 * @returns {number}
 */
export function oklabChroma(hex) {
  const rgb = parseHex(hex);
  const lab = rgbToOklab(rgb.r, rgb.g, rgb.b);
  return Math.sqrt(lab.a * lab.a + lab.b * lab.b);
}

/**
 * Computes Delta E in OKLab space between two colors (REG-02).
 *
 * @param {string | { L: number, a: number, b: number }} colorA
 * @param {string | { L: number, a: number, b: number }} colorB
 * @returns {number}
 */
export function deltaEOklab(colorA, colorB) {
  const labA = resolveOklab(colorA);
  const labB = resolveOklab(colorB);
  const dl = labA.L - labB.L;
  const da = labA.a - labB.a;
  const db = labA.b - labB.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

/**
 * Simulates color vision deficiency (protanopia, deuteranopia, tritanopia) in OKLab (REG-02).
 *
 * @param {string} hex
 * @param {"protan" | "deutan" | "tritan"} type
 * @returns {{ L: number, a: number, b: number }}
 */
export function simulateColorblind(hex, type) {
  const rgb = parseHex(hex);
  let r = rgb.r;
  let g = rgb.g;
  let b = rgb.b;
  if (type === "protan") {
    r = 0.56667 * rgb.r + 0.43333 * rgb.g;
    g = 0.55833 * rgb.r + 0.44167 * rgb.g;
    b = 0.24167 * rgb.g + 0.75833 * rgb.b;
  }
  if (type === "deutan") {
    r = 0.625 * rgb.r + 0.375 * rgb.g;
    g = 0.7 * rgb.r + 0.3 * rgb.g;
    b = 0.3 * rgb.g + 0.7 * rgb.b;
  }
  if (type === "tritan") {
    r = 0.95 * rgb.r + 0.05 * rgb.g;
    g = 0.43333 * rgb.r + 0.56667 * rgb.g;
    b = 0.475 * rgb.g + 0.525 * rgb.b;
  }
  return rgbToOklab(r, g, b);
}

/**
 * @param {any} item
 * @returns {string | number | undefined}
 */
function readMunicipalityRegionCode(item) {
  if (!item || typeof item !== "object") {
    return undefined;
  }
  if (item.regionCode !== undefined) {
    return item.regionCode;
  }
  if (item.regionId !== undefined) {
    return item.regionId;
  }
  return undefined;
}

/**
 * @param {string} [theme]
 * @returns {string[]}
 */
function resolveRegionPalette(theme) {
  if (theme === "dark") {
    return REGION_COLORS_DARK;
  }
  return REGION_COLORS_LIGHT;
}

/**
 * @param {string | { L: number, a: number, b: number }} input
 * @returns {{ L: number, a: number, b: number }}
 */
function resolveOklab(input) {
  if (typeof input === "string") {
    const rgb = parseHex(input);
    return rgbToOklab(rgb.r, rgb.g, rgb.b);
  }
  return input;
}

/**
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
function parseHex(hex) {
  const clean = hex.trim().replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return { r, g, b };
}

/**
 * @param {number} c
 * @returns {number}
 */
function srgbToLinear(c) {
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {{ L: number, a: number, b: number }}
 */
function rgbToOklab(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}
