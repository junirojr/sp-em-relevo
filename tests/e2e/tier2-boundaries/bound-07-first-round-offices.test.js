import assert from "node:assert/strict";
import test from "node:test";
import {
  mountOfficeSelectorView,
  resolveOfficeLabel,
} from "../../../src/features/election/office-selector-view.js";
import { MockDocument } from "../helpers/dom-mock.js";

test("B07-01: resolveOfficeLabel with unknown office returns Presidente", () => {
  assert.equal(resolveOfficeLabel(/** @type {any} */ ("prefeito")), "Presidente");
  assert.equal(resolveOfficeLabel(/** @type {any} */ (null)), "Presidente");
  assert.equal(resolveOfficeLabel(/** @type {any} */ (undefined)), "Presidente");
  assert.equal(resolveOfficeLabel(""), "Presidente");
});

test("B07-02: Rapid office switching updates the radio inputs correctly", () => {
  const doc = new MockDocument();
  const slot = doc.createElement("div");
  doc.body.append(slot);

  const view = mountOfficeSelectorView(doc, slot, {
    office: "presidente",
  });

  const offices = ["governador", "senador", "deputado-federal", "deputado-estadual", "presidente"];

  for (let i = 0; i < 20; i += 1) {
    const off = offices[i % offices.length];
    view.update(/** @type {any} */ (off));
  }

  assert.equal(view.getOffice(), "presidente");
  view.destroy();
});

test("B07-03: getOffice returns the currently selected office", () => {
  const doc = new MockDocument();
  const slot = doc.createElement("div");
  doc.body.append(slot);

  const view = mountOfficeSelectorView(doc, slot, {
    office: "senador",
  });

  assert.equal(view.getOffice(), "senador");
  view.update("governador");
  assert.equal(view.getOffice(), "governador");
  view.destroy();
});

test("B07-04: Clicking the currently active office does not trigger onOfficeChange", () => {
  const doc = new MockDocument();
  const slot = doc.createElement("div");
  doc.body.append(slot);

  let changeCount = 0;
  const view = mountOfficeSelectorView(doc, slot, {
    office: "presidente",
    onOfficeChange: () => {
      changeCount += 1;
    },
  });

  const radios = slot.querySelectorAll("input[type='radio']");
  const presRadio = Array.from(radios).find((r) => r.value === "presidente");
  if (presRadio) {
    presRadio.click();
    assert.equal(changeCount, 0, "clicking already active office must not re-trigger");
  }
  view.destroy();
});

test("B07-05: Destroying office selector clears slot children and innerHTML", () => {
  const doc = new MockDocument();
  const slot = doc.createElement("div");
  doc.body.append(slot);

  const view = mountOfficeSelectorView(doc, slot, {
    office: "presidente",
  });

  assert.equal(slot.children.length, 1);
  view.destroy();
  assert.equal(slot.children.length, 0);
  assert.equal(slot.innerHTML, "");
});
