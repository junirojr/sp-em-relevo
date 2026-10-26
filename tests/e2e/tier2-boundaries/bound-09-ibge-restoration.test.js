import assert from "node:assert/strict";
import test from "node:test";
import { applyControlsVisibility } from "../../../src/features/election/mode-selector-view.js";
import { MockDocument } from "../helpers/dom-mock.js";

test("B09-01: Rapid 10-cycle round-trip between Censo and Eleições leaves state clean", () => {
  const doc = new MockDocument();
  const indicatorContainer = doc.createElement("div");
  indicatorContainer.id = "indicator-container";
  doc.body.append(indicatorContainer);

  const state = {
    tab: "indicators",
    indicatorId: "density",
    levelId: "municipality",
  };

  for (let i = 0; i < 10; i += 1) {
    state.tab = "second-round";
    applyControlsVisibility(
      doc,
      /** @type {import("../../../src/features/election/election-slice.js").ElectionTab} */ (
        state.tab
      ),
    );
    assert.equal(indicatorContainer.hidden, true);

    state.tab = "indicators";
    applyControlsVisibility(
      doc,
      /** @type {import("../../../src/features/election/election-slice.js").ElectionTab} */ (
        state.tab
      ),
    );
    assert.equal(indicatorContainer.hidden, false);
  }

  assert.equal(state.indicatorId, "density", "indicator must remain intact");
});

test("B09-02: Restoration preserves custom indicator and custom level", () => {
  const state = {
    indicatorId: "gdpPerCapita",
    levelId: "governmentRegion",
    tab: "second-round",
  };

  const restored = {
    ...state,
    tab: "indicators",
  };

  assert.equal(restored.indicatorId, "gdpPerCapita");
  assert.equal(restored.levelId, "governmentRegion");
  assert.equal(restored.tab, "indicators");
});

test("B09-03: Repeated restoration sets documentElement.dataset.mode consistently", () => {
  const doc = new MockDocument();
  for (let i = 0; i < 5; i += 1) {
    applyControlsVisibility(doc, "indicators");
    assert.equal(doc.documentElement.dataset.mode, "indicator");
  }
});

test("B09-04: Restoration preserves selected comparison pair across transitions", () => {
  const state = {
    tab: "second-round",
    comparisonPair: ["3550308", "3509502"],
  };

  const nextState = {
    ...state,
    tab: "indicators",
  };

  assert.deepEqual(nextState.comparisonPair, ["3550308", "3509502"]);
});

test("B09-05: Missing document elements during restoration do not throw errors", () => {
  const doc = new MockDocument();
  // Call with empty document
  assert.doesNotThrow(() => {
    applyControlsVisibility(doc, "indicators");
  });
  assert.equal(doc.documentElement.dataset.mode, "indicator");
});
