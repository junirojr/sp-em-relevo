/**
 * Color palette ported from legacy/src/template.html and legacy/src/lab.js lines 396 to 409.
 * Follows the engine palette contract: { background, border, regionBorder, colors }.
 *
 * @typedef {import("../engine/scene.js").EnginePalette} EnginePalette
 */

export const HEAT_COLORS = [
  "#fde0dc",
  "#f8b4ab",
  "#f0877a",
  "#e55a4c",
  "#d42f27",
  "#a81d1a",
  "#741212",
];

export const LIGHT_PALETTE = {
  background: "#e8eaef",
  border: "#f8f9fb",
  regionBorder: "#2b2c33",
  colors: HEAT_COLORS,
  plate: "#d3d6df",
  primary: "#dc2828",
  selection: "#2f4bff",
  neutral: "#bec2cc",
};

export const DARK_PALETTE = {
  background: "#191a1f",
  border: "#70737f",
  regionBorder: "#eceef4",
  colors: HEAT_COLORS,
  plate: "#4a4d59",
  primary: "#e43d3d",
  selection: "#7d8cff",
  neutral: "#33353c",
};

/**
 * Reads the active palette from the document root styles or falls back to standard light palette.
 *
 * @param {Document} [documentRef]
 * @returns {EnginePalette}
 */
export function readPalette(documentRef) {
  if (!documentRef?.documentElement) {
    return LIGHT_PALETTE;
  }

  const styles = getComputedStyle(documentRef.documentElement);
  const bg = styles.getPropertyValue("--map-bg").trim();
  if (!bg) {
    return LIGHT_PALETTE;
  }

  const border = styles.getPropertyValue("--map-border").trim();
  const regionBorder = styles.getPropertyValue("--region-border").trim();

  const colors = [];
  for (let i = 1; i <= 7; i += 1) {
    const color = styles.getPropertyValue(`--heat-${i}`).trim();
    if (color) {
      colors.push(color);
    }
  }

  const resolvedColors = resolveColors(colors);

  return {
    background: bg,
    border: border || LIGHT_PALETTE.border,
    regionBorder: regionBorder || LIGHT_PALETTE.regionBorder,
    colors: resolvedColors,
    selection: styles.getPropertyValue("--selection").trim() || LIGHT_PALETTE.selection,
    neutral: styles.getPropertyValue("--heat-plate").trim() || LIGHT_PALETTE.neutral,
  };
}

/**
 * @param {string[]} colors
 * @returns {string[]}
 */
function resolveColors(colors) {
  if (colors.length === 7) {
    return colors;
  }
  return HEAT_COLORS;
}
