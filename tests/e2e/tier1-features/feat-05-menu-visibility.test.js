import assert from "node:assert/strict";
import test from "node:test";
import { applyControlsVisibility } from "../../../src/features/election/mode-selector-view.js";
import { MockDocument } from "../helpers/dom-mock.js";

function setupDomWithPanels() {
  const doc = new MockDocument();

  const indicatorContainer = doc.createElement("div");
  indicatorContainer.id = "indicator-container";
  doc.body.append(indicatorContainer);

  const appearanceContainer = doc.createElement("div");
  appearanceContainer.id = "appearance-container";

  const colorGroup = doc.createElement("div");
  colorGroup.className = "appearance-group-color";
  appearanceContainer.append(colorGroup);

  const stepOption = doc.createElement("div");
  stepOption.className = "height-mode-option-step";
  appearanceContainer.append(stepOption);

  doc.body.append(appearanceContainer);

  const stageBanner = doc.createElement("div");
  stageBanner.className = "stage-banner";
  doc.body.append(stageBanner);

  return { doc, indicatorContainer, colorGroup, stepOption, stageBanner };
}

test("F05-01: In election mode (second-round), indicator container is hidden", () => {
  const { doc, indicatorContainer } = setupDomWithPanels();

  applyControlsVisibility(doc, "second-round");
  assert.equal(
    indicatorContainer.hidden,
    true,
    "indicator-container must be hidden in election mode",
  );
});

test("F05-02: In election mode, demographic color group is hidden", () => {
  const { doc, colorGroup } = setupDomWithPanels();

  applyControlsVisibility(doc, "second-round");
  assert.equal(colorGroup.hidden, true, "appearance-group-color must be hidden in election mode");
});

test("F05-03: In election mode, step height option is hidden", () => {
  const { doc, stepOption } = setupDomWithPanels();

  applyControlsVisibility(doc, "first-round");
  assert.equal(stepOption.hidden, true, "step height option must be hidden in election mode");
});

test("F05-04: In election mode, documentElement.dataset.mode is set to election", () => {
  const { doc } = setupDomWithPanels();

  applyControlsVisibility(doc, "second-round");
  assert.equal(doc.documentElement.dataset.mode, "election", "dataset.mode must be election");
});

test("F05-05: In indicators mode, controls are restored and dataset.mode is indicator", () => {
  const { doc, indicatorContainer, colorGroup, stepOption } = setupDomWithPanels();

  applyControlsVisibility(doc, "second-round");
  assert.equal(indicatorContainer.hidden, true);

  applyControlsVisibility(doc, "indicators");
  assert.equal(
    indicatorContainer.hidden,
    false,
    "indicator-container must be visible in indicators mode",
  );
  assert.equal(colorGroup.hidden, false, "colorGroup must be visible in indicators mode");
  assert.equal(stepOption.hidden, false, "stepOption must be visible in indicators mode");
  assert.equal(doc.documentElement.dataset.mode, "indicator", "dataset.mode must be indicator");
});
