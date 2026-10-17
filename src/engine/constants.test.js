import assert from "node:assert/strict";
import test from "node:test";
import {
  BORDER_OFFSET,
  DRAG_THRESHOLD_PX,
  EASING_PER_FRAME,
  FRAME_SAMPLE_SIZE,
  HEIGHT_EASING_PER_FRAME,
  LIFT_DURATION_MS,
  PLATE_DEPTH,
  RAISE_LIFT,
  readAnimationConstants,
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
