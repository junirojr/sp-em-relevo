import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMINISTRATIVE_REGION_BOUNDARY,
  ADMINISTRATIVE_REGION_LINE_WIDTH_PX,
  BORDER_OFFSET,
  DRAG_THRESHOLD_PX,
  EASING_PER_FRAME,
  FRAME_SAMPLE_SIZE,
  GOVERNMENT_REGION_BOUNDARY,
  GOVERNMENT_REGION_LINE_WIDTH_PX,
  HEIGHT_EASING_PER_FRAME,
  LIFT_DURATION_MS,
  MAP_FIVE_LINES,
  MUNICIPAL_BOUNDARY,
  MUNICIPAL_LINE_WIDTH_PX,
  MUNICIPAL_OPACITY_AT_MUNICIPALITY_LEVEL,
  MUNICIPAL_OPACITY_AT_REGION_LEVEL,
  PLATE_DEPTH,
  POINTED_ELEVATION_ELECTION,
  POINTED_ELEVATION_INDICATOR,
  POINTED_HIGHLIGHT,
  POINTED_LINE_WIDTH_PX,
  RAISE_LIFT,
  readAnimationConstants,
  SELECTED_LINE_MIN_CONTRAST_RATIO,
  SELECTED_LINE_MIN_WIDTH_PX,
  SELECTED_PERIMETER,
  WORLD_UNITS_PER_SVG_UNIT,
  ZOOM_LEVELS,
} from "./constants.js";

test("PAR-02 readAnimationConstants returns exact animation values from legacy code", () => {
  const anim = readAnimationConstants();
  assert.equal(anim.liftDurationMs, 180);
  assert.equal(anim.easingPerFrame, 0.14);
  assert.equal(anim.heightEasingPerFrame, 0.16);
});

test("PAR-02 constants match literal legacy definitions", () => {
  assert.equal(WORLD_UNITS_PER_SVG_UNIT, 1 / 1000);
  assert.equal(PLATE_DEPTH, 2400);
  assert.equal(RAISE_LIFT, 7000);
  assert.equal(BORDER_OFFSET, 25);
  assert.equal(LIFT_DURATION_MS, 180);
  assert.equal(EASING_PER_FRAME, 0.14);
  assert.equal(HEIGHT_EASING_PER_FRAME, 0.16);
  assert.equal(DRAG_THRESHOLD_PX, 5);
  assert.equal(FRAME_SAMPLE_SIZE, 90);
  assert.deepEqual(ZOOM_LEVELS, [1, 1.5, 2.25, 3.4, 5, 7]);
});

test("ELE-12 five map lines formalize contracts for all line layers", () => {
  assert.equal(MAP_FIVE_LINES.municipalBoundary, MUNICIPAL_BOUNDARY);
  assert.equal(MAP_FIVE_LINES.governmentRegionBoundary, GOVERNMENT_REGION_BOUNDARY);
  assert.equal(MAP_FIVE_LINES.administrativeRegionBoundary, ADMINISTRATIVE_REGION_BOUNDARY);
  assert.equal(MAP_FIVE_LINES.pointedHighlight, POINTED_HIGHLIGHT);
  assert.equal(MAP_FIVE_LINES.selectedPerimeter, SELECTED_PERIMETER);

  assert.equal(MUNICIPAL_BOUNDARY.id, "municipal-boundary");
  assert.equal(MUNICIPAL_BOUNDARY.geometry, "LineSegments");
  assert.equal(MUNICIPAL_BOUNDARY.widthPx, MUNICIPAL_LINE_WIDTH_PX);
  assert.equal(MUNICIPAL_BOUNDARY.widthPx, 1);
  assert.equal(MUNICIPAL_BOUNDARY.opacityByLevel.municipality, 1.0);
  assert.equal(MUNICIPAL_BOUNDARY.opacityByLevel.governmentRegion, 0.3);
  assert.equal(MUNICIPAL_BOUNDARY.opacityByLevel.administrativeRegion, 0.3);
  assert.equal(MUNICIPAL_BOUNDARY.followsBlockTop, true);
  assert.equal(MUNICIPAL_BOUNDARY.toggleable, true);

  assert.equal(GOVERNMENT_REGION_BOUNDARY.id, "government-region-boundary");
  assert.equal(GOVERNMENT_REGION_BOUNDARY.geometry, "LineSegments");
  assert.equal(GOVERNMENT_REGION_BOUNDARY.widthPx, GOVERNMENT_REGION_LINE_WIDTH_PX);
  assert.equal(GOVERNMENT_REGION_BOUNDARY.widthPx, 1);
  assert.equal(GOVERNMENT_REGION_BOUNDARY.opacity, 1.0);
  assert.deepEqual(GOVERNMENT_REGION_BOUNDARY.visibleLevels, ["governmentRegion"]);
  assert.deepEqual(GOVERNMENT_REGION_BOUNDARY.hiddenLevels, ["municipality"]);
  assert.equal(GOVERNMENT_REGION_BOUNDARY.sharedArcsTopology, true);

  assert.equal(ADMINISTRATIVE_REGION_BOUNDARY.id, "administrative-region-boundary");
  assert.equal(ADMINISTRATIVE_REGION_BOUNDARY.geometry, "LineSegments");
  assert.equal(ADMINISTRATIVE_REGION_BOUNDARY.widthPx, ADMINISTRATIVE_REGION_LINE_WIDTH_PX);
  assert.equal(ADMINISTRATIVE_REGION_BOUNDARY.widthPx, 1);
  assert.equal(ADMINISTRATIVE_REGION_BOUNDARY.opacity, 1.0);
  assert.deepEqual(ADMINISTRATIVE_REGION_BOUNDARY.visibleLevels, ["administrativeRegion"]);
  assert.deepEqual(ADMINISTRATIVE_REGION_BOUNDARY.hiddenLevels, ["municipality"]);
  assert.equal(ADMINISTRATIVE_REGION_BOUNDARY.sharedArcsTopology, true);

  assert.equal(POINTED_HIGHLIGHT.id, "pointed-highlight");
  assert.equal(POINTED_HIGHLIGHT.geometry, "LineSegments");
  assert.equal(POINTED_HIGHLIGHT.widthPx, POINTED_LINE_WIDTH_PX);
  assert.equal(POINTED_HIGHLIGHT.widthPx, 1);
  assert.equal(POINTED_HIGHLIGHT.elevationByMode.indicator, POINTED_ELEVATION_INDICATOR);
  assert.equal(POINTED_HIGHLIGHT.elevationByMode.indicator, 7000);
  assert.equal(POINTED_HIGHLIGHT.elevationByMode.election, POINTED_ELEVATION_ELECTION);
  assert.equal(POINTED_HIGHLIGHT.elevationByMode.election, 0);
  assert.equal(POINTED_HIGHLIGHT.liftDurationMs, 180);
  assert.equal(POINTED_HIGHLIGHT.distinctFromSelection, true);
});

test("ELE-13 selected perimeter defines two-tone styling and 3px minimum width", () => {
  assert.equal(SELECTED_PERIMETER.id, "selected-perimeter");
  assert.equal(SELECTED_PERIMETER.minWidthPx, SELECTED_LINE_MIN_WIDTH_PX);
  assert.ok(SELECTED_PERIMETER.minWidthPx >= 3);
  assert.equal(SELECTED_PERIMETER.tones.outer, "dark");
  assert.equal(SELECTED_PERIMETER.tones.inner, "light");
  assert.equal(SELECTED_PERIMETER.tones.minContrastRatio, SELECTED_LINE_MIN_CONTRAST_RATIO);
  assert.ok(SELECTED_PERIMETER.tones.minContrastRatio >= 3.0);
});

test("ELE-14 selected perimeter specifies topology perimeter, elevation tracking and depth pass", () => {
  assert.equal(SELECTED_PERIMETER.geometryByMode.indicator, "LineSegments");
  assert.equal(SELECTED_PERIMETER.geometryByMode.election, "LineSegments2");
  assert.equal(SELECTED_PERIMETER.materialByMode.indicator, "LineBasicMaterial");
  assert.equal(SELECTED_PERIMETER.materialByMode.election, "LineMaterial");
  assert.equal(SELECTED_PERIMETER.perimeterOnly, true);
  assert.equal(SELECTED_PERIMETER.followsTopAnimation, true);
  assert.equal(SELECTED_PERIMETER.secondPassDepthTest, false);
});

test("NIV-07 line opacity and visibility contracts across territorial levels", () => {
  assert.equal(MUNICIPAL_OPACITY_AT_MUNICIPALITY_LEVEL, 1.0);
  assert.equal(MUNICIPAL_OPACITY_AT_REGION_LEVEL, 0.3);
  assert.equal(
    MUNICIPAL_BOUNDARY.opacityByLevel.municipality,
    MUNICIPAL_OPACITY_AT_MUNICIPALITY_LEVEL,
  );
  assert.equal(
    MUNICIPAL_BOUNDARY.opacityByLevel.governmentRegion,
    MUNICIPAL_OPACITY_AT_REGION_LEVEL,
  );
  assert.equal(
    MUNICIPAL_BOUNDARY.opacityByLevel.administrativeRegion,
    MUNICIPAL_OPACITY_AT_REGION_LEVEL,
  );
  assert.equal(GOVERNMENT_REGION_BOUNDARY.visibleLevels.includes("governmentRegion"), true);
  assert.equal(ADMINISTRATIVE_REGION_BOUNDARY.visibleLevels.includes("administrativeRegion"), true);
});
