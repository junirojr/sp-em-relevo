export const WORLD_UNITS_PER_SVG_UNIT = 1 / 1000;
export const PLATE_DEPTH = 2400;
export const SYNTHETIC_HEIGHT_GAIN = 1.6;
export const COUNT_HEIGHT_GAIN = 9;
export const RAISE_LIFT = 7000;
export const BORDER_OFFSET = 25;
export const LIFT_DURATION_MS = 180;
export const EASING_PER_FRAME = 0.14;
export const HEIGHT_EASING_PER_FRAME = 0.16;
export const MAX_TILT_RADIANS = (5 * Math.PI) / 180;
export const BASE_AZIMUTH_RADIANS = (-8 * Math.PI) / 180;
export const CAMERA_FOV_DEGREES = 30;
export const FIT_MARGIN = 0.95;
export const ZOOM_LEVELS = [1, 1.5, 2.25, 3.4, 5, 7];
export const SINGLE_CITY_SHARE_OF_MAP = 0.28;
export const GROUP_SHARE_OF_MAP = 0.7;
export const SINGLE_CITY_MIN_ZOOM = 2;
export const MAX_FRAMING_ZOOM = 7;
export const DRAG_THRESHOLD_PX = 5;
export const WHEEL_STEP_THRESHOLD = 100;
export const REGION_BORDER_OPACITY = 0.3;
export const FRAME_SAMPLE_SIZE = 90;
export const RANKING_SIZE = 12;
export const SELECTION_CHIP_LIMIT = 16;
export const HEAT_CLASS_COUNT = 7;
export const CAPITAL_CODE = "3550308";

/**
 * @returns {{ liftDurationMs: number; easingPerFrame: number; heightEasingPerFrame: number }}
 */
export function readAnimationConstants() {
  return {
    liftDurationMs: LIFT_DURATION_MS,
    easingPerFrame: EASING_PER_FRAME,
    heightEasingPerFrame: HEIGHT_EASING_PER_FRAME,
  };
}

/**
 * Five map lines contracts from section 3.3 of the plan (N0b).
 *
 * 1. MUNICIPAL_BOUNDARY:
 *    Appears across all of SP state on internal mesh arcs as LineSegments.
 *    Width: 1 px. Opacity: 1.0 at municipality level, 0.3 at RG and RA levels (NIV-07).
 *    Follows block top (ESC-12). Can be turned off with Borders setting (CFG-03).
 *
 * 2. GOVERNMENT_REGION_BOUNDARY:
 *    Appears at Government Region (RG) level on arcs separating distinct RGs (readSharedArcs).
 *    Width: 1 px. Visible at RG level, hidden at municipality level.
 *    Calculated on the same topology without external shapefile (RGV-01, RGV-03).
 *
 * 3. ADMINISTRATIVE_REGION_BOUNDARY:
 *    Appears at Administrative Region (RA) level on arcs separating distinct RAs (readSharedArcs).
 *    Width: 1 px. Visible at RA level, hidden at municipality level (NIV-07).
 *    Preserves phase 1 contract.
 *
 * 4. POINTED_HIGHLIGHT:
 *    Appears on hover or inspection touch as distinct fine highlight on top of unit or group.
 *    Width: 1 px. Indicator mode raises unit with 180 ms lift; election mode has 0 elevation (ELE-12).
 *    Distinct object from selection (ELE-12).
 *
 * 5. SELECTED_PERIMETER:
 *    Appears on active selection.
 *    Indicator mode: blue fill and outline.
 *    Election mode: LineSegments2 + LineMaterial (selection-outline.js) on perimeter of set.
 *    Width: >= 3 px CSS, dual tone (outer dark, inner light, contrast >= 3:1, ELE-13),
 *    second pass without depth test (ELE-14). Internal edges between selected units excluded (ELE-14).
 *    Follows top animation (ELE-14).
 */

export const MUNICIPAL_LINE_WIDTH_PX = 1;
export const MUNICIPAL_OPACITY_AT_MUNICIPALITY_LEVEL = 1.0;
export const MUNICIPAL_OPACITY_AT_REGION_LEVEL = 0.3;
export const GOVERNMENT_REGION_LINE_WIDTH_PX = 1;
export const ADMINISTRATIVE_REGION_LINE_WIDTH_PX = 1;
export const POINTED_LINE_WIDTH_PX = 1;
export const POINTED_ELEVATION_INDICATOR = RAISE_LIFT;
export const POINTED_ELEVATION_ELECTION = 0;
export const SELECTED_LINE_MIN_WIDTH_PX = 3;
export const SELECTED_LINE_MIN_CONTRAST_RATIO = 3.0;

export const MUNICIPAL_BOUNDARY = Object.freeze({
  id: "municipal-boundary",
  name: "Divisa municipal",
  geometry: "LineSegments",
  widthPx: MUNICIPAL_LINE_WIDTH_PX,
  opacityByLevel: Object.freeze({
    municipality: MUNICIPAL_OPACITY_AT_MUNICIPALITY_LEVEL,
    governmentRegion: MUNICIPAL_OPACITY_AT_REGION_LEVEL,
    administrativeRegion: MUNICIPAL_OPACITY_AT_REGION_LEVEL,
  }),
  followsBlockTop: true,
  toggleable: true,
});

export const GOVERNMENT_REGION_BOUNDARY = Object.freeze({
  id: "government-region-boundary",
  name: "Limite de RG",
  geometry: "LineSegments",
  widthPx: GOVERNMENT_REGION_LINE_WIDTH_PX,
  opacity: 1.0,
  visibleLevels: Object.freeze(["governmentRegion"]),
  hiddenLevels: Object.freeze(["municipality"]),
  sharedArcsTopology: true,
});

export const ADMINISTRATIVE_REGION_BOUNDARY = Object.freeze({
  id: "administrative-region-boundary",
  name: "Limite de RA",
  geometry: "LineSegments",
  widthPx: ADMINISTRATIVE_REGION_LINE_WIDTH_PX,
  opacity: 1.0,
  visibleLevels: Object.freeze(["administrativeRegion"]),
  hiddenLevels: Object.freeze(["municipality"]),
  sharedArcsTopology: true,
});

export const POINTED_HIGHLIGHT = Object.freeze({
  id: "pointed-highlight",
  name: "Apontado",
  geometry: "LineSegments",
  widthPx: POINTED_LINE_WIDTH_PX,
  elevationByMode: Object.freeze({
    indicator: POINTED_ELEVATION_INDICATOR,
    election: POINTED_ELEVATION_ELECTION,
  }),
  liftDurationMs: LIFT_DURATION_MS,
  distinctFromSelection: true,
});

export const SELECTED_PERIMETER = Object.freeze({
  id: "selected-perimeter",
  name: "Selecionado",
  geometryByMode: Object.freeze({
    indicator: "LineSegments",
    election: "LineSegments2",
  }),
  materialByMode: Object.freeze({
    indicator: "LineBasicMaterial",
    election: "LineMaterial",
  }),
  minWidthPx: SELECTED_LINE_MIN_WIDTH_PX,
  tones: Object.freeze({
    outer: "dark",
    inner: "light",
    minContrastRatio: SELECTED_LINE_MIN_CONTRAST_RATIO,
  }),
  secondPassDepthTest: false,
  perimeterOnly: true,
  followsTopAnimation: true,
});

export const MAP_FIVE_LINES = Object.freeze({
  municipalBoundary: MUNICIPAL_BOUNDARY,
  governmentRegionBoundary: GOVERNMENT_REGION_BOUNDARY,
  administrativeRegionBoundary: ADMINISTRATIVE_REGION_BOUNDARY,
  pointedHighlight: POINTED_HIGHLIGHT,
  selectedPerimeter: SELECTED_PERIMETER,
});

