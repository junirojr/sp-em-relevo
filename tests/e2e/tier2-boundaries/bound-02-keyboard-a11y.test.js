import assert from "node:assert/strict";
import test from "node:test";
import { MockDocument } from "../helpers/dom-mock.js";

test("B02-01: ArrowRight on last option wraps around to first option", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  let currentTab = "second-round";
  mod.mountModeToggle(container, {
    activeTab: currentTab,
    onSelectTab: (t) => {
      currentTab = t;
    },
    documentRef: doc,
  });

  const buttons = container.querySelectorAll("button, input[type='radio']");
  if (buttons.length >= 2) {
    buttons[buttons.length - 1].focus();
    buttons[buttons.length - 1].dispatchEvent({
      type: "keydown",
      key: "ArrowRight",
      code: "ArrowRight",
      bubbles: true,
    });
    assert.ok(currentTab === "indicators" || doc.activeElement === buttons[0]);
  }
});

test("B02-02: ArrowLeft on first option wraps around to last option", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  let currentTab = "indicators";
  mod.mountModeToggle(container, {
    activeTab: currentTab,
    onSelectTab: (t) => {
      currentTab = t;
    },
    documentRef: doc,
  });

  const buttons = container.querySelectorAll("button, input[type='radio']");
  if (buttons.length >= 2) {
    buttons[0].focus();
    buttons[0].dispatchEvent({
      type: "keydown",
      key: "ArrowLeft",
      code: "ArrowLeft",
      bubbles: true,
    });
    assert.ok(currentTab === "second-round" || doc.activeElement === buttons[buttons.length - 1]);
  }
});

test("B02-03: Alphanumeric and modifier keys do not alter active mode", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  let currentTab = "indicators";
  mod.mountModeToggle(container, {
    activeTab: currentTab,
    onSelectTab: (t) => {
      currentTab = t;
    },
    documentRef: doc,
  });

  const buttons = container.querySelectorAll("button, input[type='radio']");
  buttons[0].dispatchEvent({ type: "keydown", key: "A", code: "KeyA", bubbles: true });
  buttons[0].dispatchEvent({ type: "keydown", key: "Shift", code: "ShiftLeft", bubbles: true });

  assert.equal(currentTab, "indicators");
});

test("B02-04: Escape key does not corrupt or hide mode toggle", async () => {
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

  container.dispatchEvent({ type: "keydown", key: "Escape", code: "Escape", bubbles: true });
  assert.equal(container.hidden, false, "toggle must remain visible on Escape");
});

test("B02-05: Rapid focus and blur events do not trigger unintentional mode changes", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  let changeCount = 0;
  mod.mountModeToggle(container, {
    activeTab: "indicators",
    onSelectTab: () => {
      changeCount += 1;
    },
    documentRef: doc,
  });

  const buttons = container.querySelectorAll("button, input[type='radio']");
  for (let i = 0; i < 10; i += 1) {
    buttons[0].focus();
    buttons[0].blur();
  }

  assert.equal(changeCount, 0, "focus/blur alone must not trigger onSelectTab");
});
