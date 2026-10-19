import assert from "node:assert/strict";
import test from "node:test";
import {
  FIRST_ROUND_OFFICES,
  mountOfficeSelectorView,
} from "../../../src/features/election/office-selector-view.js";
import { MockDocument } from "../helpers/dom-mock.js";

test("F07-01: FIRST_ROUND_OFFICES defines exactly the 5 official offices", () => {
  assert.equal(FIRST_ROUND_OFFICES.length, 5);
  const ids = FIRST_ROUND_OFFICES.map((o) => o.id);
  assert.deepEqual(ids, [
    "presidente",
    "governador",
    "senador",
    "deputado-federal",
    "deputado-estadual",
  ]);
});

test("F07-02: Office selector component mounts radio controls for all 5 offices", () => {
  const doc = new MockDocument();
  const slot = doc.createElement("div");
  doc.body.append(slot);

  const view = mountOfficeSelectorView(doc, slot, {
    office: "presidente",
    onOfficeChange: () => {},
  });

  const radios = slot.querySelectorAll("input[type='radio']");
  assert.equal(radios.length, 5, "must render 5 radio inputs");
  view.destroy();
});

test("F07-03: Selecting Governador triggers onOfficeChange callback", () => {
  const doc = new MockDocument();
  const slot = doc.createElement("div");
  doc.body.append(slot);

  let selectedOffice = null;
  const view = mountOfficeSelectorView(doc, slot, {
    office: "presidente",
    onOfficeChange: (off) => {
      selectedOffice = off;
    },
  });

  const radios = slot.querySelectorAll("input[type='radio']");
  const govRadio = Array.from(radios).find((r) => r.value === "governador");
  assert.ok(govRadio, "governador radio must exist");
  govRadio.click();

  assert.equal(selectedOffice, "governador");
  view.destroy();
});

test("F07-04: Selecting Senador triggers onOfficeChange callback", () => {
  const doc = new MockDocument();
  const slot = doc.createElement("div");
  doc.body.append(slot);

  let selectedOffice = null;
  const view = mountOfficeSelectorView(doc, slot, {
    office: "presidente",
    onOfficeChange: (off) => {
      selectedOffice = off;
    },
  });

  const radios = slot.querySelectorAll("input[type='radio']");
  const senRadio = Array.from(radios).find((r) => r.value === "senador");
  assert.ok(senRadio, "senador radio must exist");
  senRadio.click();

  assert.equal(selectedOffice, "senador");
  view.destroy();
});

test("F07-05: Selecting Deputado Federal triggers onOfficeChange callback", () => {
  const doc = new MockDocument();
  const slot = doc.createElement("div");
  doc.body.append(slot);

  let selectedOffice = null;
  const view = mountOfficeSelectorView(doc, slot, {
    office: "presidente",
    onOfficeChange: (off) => {
      selectedOffice = off;
    },
  });

  const radios = slot.querySelectorAll("input[type='radio']");
  const fedRadio = Array.from(radios).find((r) => r.value === "deputado-federal");
  assert.ok(fedRadio, "deputado federal radio must exist");
  fedRadio.click();

  assert.equal(selectedOffice, "deputado-federal");
  view.destroy();
});
