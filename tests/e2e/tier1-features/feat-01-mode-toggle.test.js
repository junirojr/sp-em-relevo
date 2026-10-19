import assert from "node:assert/strict";
import test from "node:test";
import { MockDocument } from "../helpers/dom-mock.js";

test("F01-01: Header mode toggle component is exported and mounts in container", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");
  assert.equal(typeof mod.mountModeToggle, "function", "mountModeToggle must be exported function");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  container.id = "mode-toggle-container";
  doc.body.append(container);

  let _selectedTab = null;
  const toggle = mod.mountModeToggle(container, {
    activeTab: "indicators",
    onSelectTab: (tab) => {
      _selectedTab = tab;
    },
    documentRef: doc,
  });

  assert.ok(toggle, "mountModeToggle must return toggle instance");
  assert.ok(container.children.length > 0, "container must contain mounted toggle elements");
});

test("F01-02: Header mode toggle renders options for Censo IBGE and Eleições TSE", async () => {
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

  const textContent = container.textContent;
  assert.ok(
    textContent.includes("Censo") || textContent.includes("IBGE"),
    "toggle must render Censo/IBGE option",
  );
  assert.ok(
    textContent.includes("Eleições") || textContent.includes("TSE"),
    "toggle must render Eleições/TSE option",
  );
});

test("F01-03: Header mode toggle highlights active tab with segmented pill class", async () => {
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

  const activeBtn = container.querySelector('[aria-pressed="true"], [data-active="true"], .active');
  assert.ok(activeBtn, "active tab option must have active state indicator");
});

test("F01-04: Clicking Eleições TSE triggers onSelectTab with second-round", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  let targetTab = null;
  mod.mountModeToggle(container, {
    activeTab: "indicators",
    onSelectTab: (tab) => {
      targetTab = tab;
    },
    documentRef: doc,
  });

  const buttons = container.querySelectorAll("button, [role='button'], input[type='radio']");
  assert.ok(buttons.length >= 2, "must have at least 2 selectable mode buttons");

  const electionBtn = Array.from(buttons).find((b) =>
    (b.textContent || b.value || "").toLowerCase().includes("elei"),
  );
  assert.ok(electionBtn, "election button must exist in toggle");
  electionBtn.click();

  assert.equal(targetTab, "second-round", "clicking election toggle must default to second-round");
});

test("F01-05: Clicking Censo IBGE triggers onSelectTab with indicators", async () => {
  const mod = await import("../../../src/features/layout/mode-toggle-view.js").catch(() => null);
  assert.ok(mod, "src/features/layout/mode-toggle-view.js must be implemented");

  const doc = new MockDocument();
  const container = doc.createElement("div");
  doc.body.append(container);

  let targetTab = null;
  mod.mountModeToggle(container, {
    activeTab: "second-round",
    onSelectTab: (tab) => {
      targetTab = tab;
    },
    documentRef: doc,
  });

  const buttons = container.querySelectorAll("button, [role='button'], input[type='radio']");
  const ibgeBtn = Array.from(buttons).find((b) =>
    (b.textContent || b.value || "").toLowerCase().includes("censo"),
  );
  assert.ok(ibgeBtn, "censo button must exist in toggle");
  ibgeBtn.click();

  assert.equal(targetTab, "indicators", "clicking censo toggle must select indicators");
});
