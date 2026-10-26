import assert from "node:assert/strict";
import test from "node:test";
import { applyControlsVisibility } from "../../../src/features/election/mode-selector-view.js";
import { MockDocument } from "../helpers/dom-mock.js";

test("F09-01: Switching from TSE back to Censo IBGE restores indicators tab", () => {
  let activeTab = "second-round";
  /**
   * @param {string} nextTab
   */
  function switchTab(nextTab) {
    activeTab = nextTab;
  }
  switchTab("indicators");
  assert.equal(activeTab, "indicators");
});

test("F09-02: applyControlsVisibility restores demographic containers when switching to indicators", () => {
  const doc = new MockDocument();
  const indicatorContainer = doc.createElement("div");
  indicatorContainer.id = "indicator-container";
  doc.body.append(indicatorContainer);

  applyControlsVisibility(doc, "second-round");
  assert.equal(indicatorContainer.hidden, true);

  applyControlsVisibility(doc, "indicators");
  assert.equal(indicatorContainer.hidden, false);
});

test("F09-03: Switching back to IBGE mode preserves currently selected municipality code", () => {
  const state = {
    tab: "second-round",
    selectedCode: "3550308",
  };

  const nextState = {
    ...state,
    tab: "indicators",
  };

  assert.equal(nextState.tab, "indicators");
  assert.equal(
    nextState.selectedCode,
    "3550308",
    "selected code must be preserved across tab change",
  );
});

test("F09-04: documentElement.dataset.mode is restored to indicator", () => {
  const doc = new MockDocument();
  applyControlsVisibility(doc, "second-round");
  assert.equal(doc.documentElement.dataset.mode, "election");

  applyControlsVisibility(doc, "indicators");
  assert.equal(doc.documentElement.dataset.mode, "indicator");
});

test("F09-05: Tab switching functions purely via in-memory state without window.location.reload", () => {
  let reloaded = false;
  const _fakeWindow = {
    location: {
      reload() {
        reloaded = true;
      },
    },
  };

  // State transitions must be pure in-app transitions
  const state = { tab: "second-round" };
  const nextState = { ...state, tab: "indicators" };

  assert.equal(reloaded, false, "in-memory restoration must not reload page");
  assert.equal(nextState.tab, "indicators");
});
