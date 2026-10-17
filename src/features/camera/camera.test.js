import assert from "node:assert/strict";
import { test } from "node:test";
import { zoomControlsState } from "./camera-view.js";

const MAX_ZOOM = 7;

test("CAM-07 zoom in is disabled at the maximum zoom level", () => {
  const state = zoomControlsState(MAX_ZOOM, MAX_ZOOM);

  assert.equal(state.zoomInDisabled, true);
});

test("CAM-07 zoom in is disabled within 0.01 of the maximum zoom level", () => {
  const state = zoomControlsState(6.995, MAX_ZOOM);

  assert.equal(state.zoomInDisabled, true);
});

test("CAM-07 zoom in stays enabled below the maximum zoom level", () => {
  const state = zoomControlsState(5, MAX_ZOOM);

  assert.equal(state.zoomInDisabled, false);
});

test("CAM-07 zoom in uses the maximum zoom received as parameter", () => {
  assert.equal(zoomControlsState(3.4, 3.4).zoomInDisabled, true);
  assert.equal(zoomControlsState(3.4, 5).zoomInDisabled, false);
});

test("CAM-07 zoom out is disabled at zoom level 1", () => {
  const state = zoomControlsState(1, MAX_ZOOM);

  assert.equal(state.zoomOutDisabled, true);
});

test("CAM-07 zoom out is disabled within 0.001 of zoom level 1", () => {
  const state = zoomControlsState(1.0005, MAX_ZOOM);

  assert.equal(state.zoomOutDisabled, true);
});

test("CAM-07 zoom out stays enabled above zoom level 1", () => {
  const state = zoomControlsState(1.01, MAX_ZOOM);

  assert.equal(state.zoomOutDisabled, false);
});

test("CAM-07 both zoom buttons are enabled between the limits", () => {
  const state = zoomControlsState(2.25, MAX_ZOOM);

  assert.equal(state.zoomInDisabled, false);
  assert.equal(state.zoomOutDisabled, false);
});
