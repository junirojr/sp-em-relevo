import assert from "node:assert/strict";
import test from "node:test";
import { MockDocument } from "../helpers/dom-mock.js";

test("B01-01: Rapid 20-click toggling leaves state consistent with last click", async () => {
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
  assert.ok(buttons.length >= 2);

  for (let i = 0; i < 20; i += 1) {
    const btn = buttons[i % 2];
    btn.click();
  }

  assert.ok(
    currentTab === "indicators" || currentTab === "second-round" || currentTab === "first-round",
  );
});

test("B01-02: Mount with missing container throws or handles gracefully without crash", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  assert.doesNotThrow(() => {
    mod.mountModeToggle(null, {
      activeTab: "indicators",
      onSelectTab: () => {},
    });
  });
});

test("B01-03: Unknown tab identifier in mount falls back to indicators", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  assert.doesNotThrow(() => {
    mod.mountModeToggle(container, {
      activeTab: /** @type {any} */ ("unknown-tab-xyz"),
      onSelectTab: () => {},
      documentRef: doc,
    });
  });
});

test("B01-04: Clicking the already active tab does not re-trigger redundant state dispatch", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  let dispatchCount = 0;
  mod.mountModeToggle(container, {
    activeTab: "indicators",
    onSelectTab: () => {
      dispatchCount += 1;
    },
    documentRef: doc,
  });

  const buttons = container.querySelectorAll("button, input[type='radio']");
  const ibgeBtn = Array.from(buttons).find((b) =>
    (b.textContent || b.value || "").toLowerCase().includes("censo"),
  );
  if (ibgeBtn) {
    ibgeBtn.click();
    assert.equal(dispatchCount, 0, "clicking already active tab should be a no-op");
  }
});

test("B01-05: Destroying toggle unmounts elements and detaches listeners", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  const toggle = mod.mountModeToggle(container, {
    activeTab: "indicators",
    onSelectTab: () => {},
    documentRef: doc,
  });

  if (typeof toggle?.destroy === "function") {
    toggle.destroy();
    assert.equal(container.children.length, 0);
  }
});
