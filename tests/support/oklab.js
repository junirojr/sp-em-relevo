/**
 * OKLab color space conversion and deltaE calculation.
 * Follows LAY-06 and R12.
 * Based on the OKLab color model by Björn Ottosson.
 *
 * @typedef {{ L: number, a: number, b: number }} OklabColor
 * @typedef {{ r: number, g: number, b: number }} RgbColor
 */

/**
 * Calculates Euclidean distance in OKLab color space: Delta E OKLab.
 *
 * @param {OklabColor} lab1
 * @param {OklabColor} lab2
 * @returns {number}
 */
export function deltaEOklab(lab1, lab2) {
  const dl = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

/**
 * Converts a hex or rgb string into OKLab coordinates.
 *
 * @param {string} colorStr
 * @returns {OklabColor}
 */
export function oklab(colorStr) {
  const rgb = parseColorToRgb(colorStr);
  return rgbToOklab(rgb.r, rgb.g, rgb.b);
}

/**
 * Converts standard sRGB values [0..1] to OKLab coordinates.
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {OklabColor}
 */
export function rgbToOklab(r, g, b) {
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

/**
 * @param {string} input
 * @returns {RgbColor}
 */
export function parseColorToRgb(input) {
  const trimmed = input.trim();
  if (trimmed.startsWith("#")) {
    return parseHexToRgb(trimmed);
  }
  if (trimmed.startsWith("rgb")) {
    return parseRgbStringToRgb(trimmed);
  }
  throw new Error(`Unsupported color format: ${input}`);
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
 * @param {string} hex
 * @returns {RgbColor}
 */
function parseHexToRgb(hex) {
  const cleanHex = hex.replace("#", "");
  if (cleanHex.length === 3) {
    const r = Number.parseInt(cleanHex[0] + cleanHex[0], 16) / 255;
    const g = Number.parseInt(cleanHex[1] + cleanHex[1], 16) / 255;
    const b = Number.parseInt(cleanHex[2] + cleanHex[2], 16) / 255;
    return { r, g, b };
  }
  if (cleanHex.length === 6) {
    const r = Number.parseInt(cleanHex.slice(0, 2), 16) / 255;
    const g = Number.parseInt(cleanHex.slice(2, 4), 16) / 255;
    const b = Number.parseInt(cleanHex.slice(4, 6), 16) / 255;
    return { r, g, b };
  }
  throw new Error(`Invalid hex color: ${hex}`);
}

/**
 * @param {string} rgbStr
 * @returns {RgbColor}
 */
function parseRgbStringToRgb(rgbStr) {
  const match = rgbStr.match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) {
    throw new Error(`Invalid rgb string: ${rgbStr}`);
  }
  return {
    r: Number.parseFloat(match[0]) / 255,
    g: Number.parseFloat(match[1]) / 255,
    b: Number.parseFloat(match[2]) / 255,
  };
}
