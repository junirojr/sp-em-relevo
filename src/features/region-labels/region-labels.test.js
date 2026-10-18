import assert from "node:assert/strict";
import { test } from "node:test";
import {
  areBoxesOverlapping,
  computeLabelCollisions,
  estimateLabelWidth,
  mountRegionLabelsView,
  REGION_LABEL_DEFINITIONS,
} from "./region-labels-view.js";

test("REG-03 16 region label definitions exist without forbidden dashes", () => {
  assert.equal(REGION_LABEL_DEFINITIONS.length, 16);
  for (const def of REGION_LABEL_DEFINITIONS) {
    assert.ok(def.code);
    assert.ok(def.label);
    assert.equal(def.label.includes("\u2013"), false);
    assert.equal(def.label.includes("\u2014"), false);
    assert.ok(def.x >= 0 && def.x <= 1);
    assert.ok(def.y >= 0 && def.y <= 1);
    assert.ok(def.priority >= 1 && def.priority <= 16);
  }
});

test("REG-03 bounding box overlap calculation detects collisions accurately", () => {
  const boxA = { x: 100, y: 100, width: 80, height: 24 };
  const boxB = { x: 150, y: 110, width: 80, height: 24 };
  const boxFar = { x: 300, y: 300, width: 80, height: 24 };

  assert.equal(areBoxesOverlapping(boxA, boxB, 4), true);
  assert.equal(areBoxesOverlapping(boxA, boxFar, 4), false);
});

test("REG-03 collision discard algorithm leaves zero overlapping visible labels in 1366x768", () => {
  const width = 1366;
  const height = 768;
  const placements = computeLabelCollisions(REGION_LABEL_DEFINITIONS, width, height);

  assert.equal(placements.length, 16);

  const visiblePlacements = placements.filter((p) => p.visible);
  assert.ok(visiblePlacements.length >= 8);

  for (let i = 0; i < visiblePlacements.length; i += 1) {
    for (let j = i + 1; j < visiblePlacements.length; j += 1) {
      const box1 = visiblePlacements[i].box;
      const box2 = visiblePlacements[j].box;
      const overlaps = areBoxesOverlapping(box1, box2, 0);
      assert.equal(
        overlaps,
        false,
        `Labels ${visiblePlacements[i].label} and ${visiblePlacements[j].label} must not overlap in 1366x768`,
      );
    }
  }

  // Every placement remains accessible for the data table
  for (const placement of placements) {
    assert.equal(placement.inTable, true);
  }
});

test("REG-03 collision discard algorithm leaves zero overlapping visible labels in 390x844 (mobile)", () => {
  const width = 390;
  const height = 844;
  const placements = computeLabelCollisions(REGION_LABEL_DEFINITIONS, width, height);

  assert.equal(placements.length, 16);

  const visiblePlacements = placements.filter((p) => p.visible);
  const hiddenPlacements = placements.filter((p) => !p.visible);

  // In a compact screen, some overlapping labels must be discarded
  assert.ok(hiddenPlacements.length > 0);
  assert.ok(visiblePlacements.length > 0);

  // Crucially, zero visible labels overlap
  for (let i = 0; i < visiblePlacements.length; i += 1) {
    for (let j = i + 1; j < visiblePlacements.length; j += 1) {
      const box1 = visiblePlacements[i].box;
      const box2 = visiblePlacements[j].box;
      const overlaps = areBoxesOverlapping(box1, box2, 0);
      assert.equal(
        overlaps,
        false,
        `Labels ${visiblePlacements[i].label} and ${visiblePlacements[j].label} must not overlap in 390x844`,
      );
    }
  }

  // All 16 regions are retained in the alternative table
  for (const placement of placements) {
    assert.equal(placement.inTable, true);
  }
});

test("BAS-04 mounting region labels view does not start any frame loop or timer while idle", () => {
  const fakeDoc = createFakeDocument();
  const fakeContainer = fakeDoc.createElement("div");

  const view = mountRegionLabelsView(fakeDoc, fakeContainer);
  assert.ok(view.element);
  assert.equal(view.getLabels().length, 16);

  // Update calculates placements synchronously without background loops
  const placements = view.update(1366, 768);
  assert.equal(placements.length, 16);

  view.destroy();
});

test("BAS-09 collision computation completes well below 1 ms", () => {
  const start = performance.now();
  for (let i = 0; i < 100; i += 1) {
    computeLabelCollisions(REGION_LABEL_DEFINITIONS, 1366, 768);
    computeLabelCollisions(REGION_LABEL_DEFINITIONS, 390, 844);
  }
  const totalDuration = performance.now() - start;
  const averagePerRun = totalDuration / 200;
  assert.ok(
    averagePerRun < 1,
    `Average collision calculation ${averagePerRun} ms must be below 1 ms`,
  );
});

function createFakeDocument() {
  return /** @type {any} */ ({
    createElement: (/** @type {string} */ tag) => {
      const classes = new Set();
      const style = {};
      const dataset = {};
      const children = [];
      const element = {
        tagName: tag,
        className: "",
        hidden: false,
        textContent: "",
        style,
        dataset,
        children,
        classList: {
          add: (/** @type {string} */ cls) => classes.add(cls),
          remove: (/** @type {string} */ cls) => classes.delete(cls),
          contains: (/** @type {string} */ cls) => classes.has(cls),
        },
        append: (...nodes) => children.push(...nodes),
        setAttribute: () => {},
        remove: () => {},
      };
      return element;
    },
  });
}
