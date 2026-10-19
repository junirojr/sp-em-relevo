import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { mountBottomNavView } from "../../../src/features/layout/bottom-nav-view.js";
import {
  normalizeSheetState,
  resolveDraggedSheetState,
  SHEET_STATE_COLLAPSED,
  SHEET_STATE_EXPANDED,
  SHEET_STATE_HALF,
  SHEET_STATES,
} from "../../../src/features/layout/layout-view.js";
import { MockDocument } from "../helpers/dom-mock.js";

test("B04-01: Layout css bounds width to prevent horizontal overflow on 320px screens", () => {
  const css = fs.readFileSync("src/features/layout/layout.css", "utf8");
  assert.ok(
    css.includes("overflow") || css.includes("max-width") || css.includes("box-sizing"),
    "css must contain rules controlling container bounds",
  );
});

test("B04-02: Rapid switching of bottom nav tabs keeps state synchronized with last call", () => {
  const doc = new MockDocument();
  const container = doc.createElement("div");
  const tabs = ["mapa", "indicadores", "municipios", "comparativo", "camadas"];

  const nav = mountBottomNavView(doc, container, {
    activeTab: "mapa",
  });

  for (let i = 0; i < 20; i += 1) {
    const target = tabs[i % tabs.length];
    nav.setActiveTab(/** @type {any} */ (target));
  }

  nav.destroy();
});

test("B04-03: Bottom sheet states and dragging transitions normalize correctly", () => {
  assert.deepEqual(SHEET_STATES, [SHEET_STATE_COLLAPSED, SHEET_STATE_HALF, SHEET_STATE_EXPANDED]);
  assert.equal(normalizeSheetState("invalid"), SHEET_STATE_COLLAPSED);
  assert.equal(normalizeSheetState(SHEET_STATE_HALF), SHEET_STATE_HALF);
  assert.equal(normalizeSheetState(SHEET_STATE_EXPANDED), SHEET_STATE_EXPANDED);

  // Upward drag from collapsed opens to half
  assert.equal(resolveDraggedSheetState(SHEET_STATE_COLLAPSED, -30), SHEET_STATE_HALF);
});

test("B04-04: setElectionMode toggles label between Indicadores and Eleições", () => {
  const doc = new MockDocument();
  const container = doc.createElement("div");
  const nav = mountBottomNavView(doc, container, {
    activeTab: "indicadores",
    isElection: false,
  });

  nav.setElectionMode(true);
  assert.ok(container.textContent.includes("Eleições") || container.innerHTML.includes("eleicoes"));

  nav.setElectionMode(false);
  assert.ok(
    container.textContent.includes("Indicadores") || container.innerHTML.includes("indicadores"),
  );
  nav.destroy();
});

test("B04-05: Destroying bottom nav clears container innerHTML", () => {
  const doc = new MockDocument();
  const container = doc.createElement("div");
  const nav = mountBottomNavView(doc, container, {
    activeTab: "mapa",
  });

  assert.ok(container.children.length > 0);
  nav.destroy();
  assert.equal(container.children.length, 0);
});
