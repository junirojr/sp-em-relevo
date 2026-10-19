import assert from "node:assert/strict";
import test from "node:test";
import { applyControlsVisibility } from "../../../src/features/election/mode-selector-view.js";
import { MockDocument } from "../helpers/dom-mock.js";

test("B05-01: applyControlsVisibility with completely empty document does not throw", () => {
  const doc = new MockDocument();
  assert.doesNotThrow(() => {
    applyControlsVisibility(doc, "second-round");
    applyControlsVisibility(doc, "indicators");
  });
});

test("B05-02: Rapid alternating calls (20 times) leaves DOM in state matching the final call", () => {
  const doc = new MockDocument();
  const indicatorContainer = doc.createElement("div");
  indicatorContainer.id = "indicator-container";
  doc.body.append(indicatorContainer);

  for (let i = 0; i < 20; i += 1) {
    const tab = i % 2 === 0 ? "second-round" : "indicators";
    applyControlsVisibility(doc, tab);
  }

  // Final call was i = 19 (indicators)
  assert.equal(indicatorContainer.hidden, false);
  assert.equal(doc.documentElement.dataset.mode, "indicator");
});

test("B05-03: first-round tab applies same indicator hiding rules as second-round", () => {
  const doc = new MockDocument();
  const indicatorContainer = doc.createElement("div");
  indicatorContainer.id = "indicator-container";
  doc.body.append(indicatorContainer);

  applyControlsVisibility(doc, "first-round");
  assert.equal(indicatorContainer.hidden, true);
  assert.equal(doc.documentElement.dataset.mode, "election");
});

test("B05-04: Invalid tab parameter defaults dataset.mode to indicator", () => {
  const doc = new MockDocument();
  applyControlsVisibility(doc, /** @type {any} */ ("non-existent-tab"));
  assert.equal(doc.documentElement.dataset.mode, "indicator");
});

test("B05-05: Missing appearance container does not break indicator container toggling", () => {
  const doc = new MockDocument();
  const indicatorContainer = doc.createElement("div");
  indicatorContainer.id = "indicator-container";
  doc.body.append(indicatorContainer);

  // Note: appearance-container is deliberately NOT added
  assert.doesNotThrow(() => {
    applyControlsVisibility(doc, "second-round");
  });
  assert.equal(indicatorContainer.hidden, true);
});
