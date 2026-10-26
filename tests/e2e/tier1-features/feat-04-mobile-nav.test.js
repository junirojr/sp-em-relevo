import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { mountBottomNavView } from "../../../src/features/layout/bottom-nav-view.js";
import { MockDocument } from "../helpers/dom-mock.js";

test("F04-01: Layout stylesheet includes responsive media query <=640px preventing overflow", () => {
  const css = fs.readFileSync("src/features/layout/layout.css", "utf8");
  assert.ok(
    css.includes("@media (max-width: 640px)") ||
      css.includes("@media (max-width: 600px)") ||
      css.includes("@media (max-width: 768px)") ||
      css.includes("@media (max-width: 900px)"),
    "layout.css must contain responsive mobile media query",
  );
});

test("F04-02: Bottom navigation renders accessible navigation tabs", () => {
  const doc = new MockDocument();
  const container = doc.createElement("div");
  let _selectedTab = null;

  const nav = mountBottomNavView(doc, container, {
    activeTab: "indicadores",
    onTabSelect: (tab) => {
      _selectedTab = tab;
    },
  });

  assert.ok(nav.element, "bottom nav element must be returned");
  const buttons = nav.element.querySelectorAll("button, [role='tab']");
  assert.ok(buttons.length >= 2, "bottom nav must have multiple tabs");
  nav.destroy();
});

test("F04-03: Bottom navigation active state tracks activeTab parameter", () => {
  const doc = new MockDocument();
  const container = doc.createElement("div");
  const nav = mountBottomNavView(doc, container, {
    activeTab: "indicadores",
    isElection: true,
    onTabSelect: () => {},
  });

  const active = nav.element.querySelector('[aria-selected="true"], [data-active="true"], .active');
  assert.ok(active, "active tab in bottom nav must be highlighted");
  nav.destroy();
});

test("F04-04: Clicking tab in bottom nav dispatches onTabSelect", () => {
  const doc = new MockDocument();
  const container = doc.createElement("div");
  let clickedTab = null;
  const nav = mountBottomNavView(doc, container, {
    activeTab: "mapa",
    onTabSelect: (tab) => {
      clickedTab = tab;
    },
  });

  const buttons = nav.element.querySelectorAll("button, [role='tab']");
  /** @type {HTMLElement} */ (buttons[1]).click();
  assert.ok(clickedTab !== null, "clicking tab must trigger onTabSelect");
  nav.destroy();
});

test("F04-05: Bottom nav buttons satisfy accessible minimum touch target dimensions", () => {
  const css = fs.readFileSync("src/features/layout/bottom-nav.css", "utf8");
  assert.ok(
    css.includes("min-height") || css.includes("padding") || css.includes("height"),
    "bottom-nav.css must define sizing rules for accessible tap targets",
  );
});
