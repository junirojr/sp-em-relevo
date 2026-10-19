import assert from "node:assert/strict";
import test from "node:test";
import { MockDocument } from "../helpers/dom-mock.js";

test("F02-01: Mode toggle exposes semantic accessibility attributes (aria-label, aria-pressed or radio)", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  mod.mountModeToggle(container, {
    activeTab: "indicators",
    onSelectTab: () => {},
    documentRef: doc,
  });

  const group = container.querySelector("[role='group'], [role='radiogroup'], fieldset");
  assert.ok(group, "toggle container must have role group/radiogroup or fieldset");
  const label = group.getAttribute("aria-label") || container.querySelector("legend")?.textContent;
  assert.ok(label && label.length > 0, "toggle group must have accessible label");
});

test("F02-02: Mode toggle interactive items are focusable with tabIndex >= 0", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  mod.mountModeToggle(container, {
    activeTab: "indicators",
    onSelectTab: () => {},
    documentRef: doc,
  });

  const focusable = container.querySelectorAll("button, input[type='radio'], [tabindex]");
  assert.ok(focusable.length >= 2, "must provide focusable controls");
  for (const item of focusable) {
    assert.ok(item.tabIndex >= 0, "interactive items must have non-negative tabIndex");
  }
});

test("F02-03: Arrow keys navigate between mode options", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  let selectedTab = "indicators";
  mod.mountModeToggle(container, {
    activeTab: selectedTab,
    onSelectTab: (tab) => {
      selectedTab = tab;
    },
    documentRef: doc,
  });

  const buttons = container.querySelectorAll("button, input[type='radio']");
  assert.ok(buttons.length >= 2, "must have at least 2 items");

  buttons[0].focus();
  buttons[0].dispatchEvent({
    type: "keydown",
    key: "ArrowRight",
    code: "ArrowRight",
    bubbles: true,
  });

  assert.ok(
    selectedTab === "second-round" || doc.activeElement === buttons[1],
    "ArrowRight should navigate to or select next option",
  );
});

test("F02-04: Enter key triggers selection on focused mode option", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  let selectedTab = "indicators";
  mod.mountModeToggle(container, {
    activeTab: selectedTab,
    onSelectTab: (tab) => {
      selectedTab = tab;
    },
    documentRef: doc,
  });

  const buttons = container.querySelectorAll("button, input[type='radio']");
  buttons[1].focus();
  buttons[1].dispatchEvent({
    type: "keydown",
    key: "Enter",
    code: "Enter",
    bubbles: true,
  });

  assert.ok(
    selectedTab === "second-round" || selectedTab === "first-round",
    "Enter key must activate the focused mode option",
  );
});

test("F02-05: Space key triggers selection on focused mode option", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  let selectedTab = "second-round";
  mod.mountModeToggle(container, {
    activeTab: selectedTab,
    onSelectTab: (tab) => {
      selectedTab = tab;
    },
    documentRef: doc,
  });

  const buttons = container.querySelectorAll("button, input[type='radio']");
  buttons[0].focus();
  buttons[0].dispatchEvent({
    type: "keydown",
    key: " ",
    code: "Space",
    bubbles: true,
  });

  assert.equal(selectedTab, "indicators", "Space key must activate Censo IBGE option");
});
