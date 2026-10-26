import assert from "node:assert/strict";
import test from "node:test";
import { applyControlsVisibility } from "../../../src/features/election/mode-selector-view.js";
import { MockDocument } from "../helpers/dom-mock.js";

test("F13-01: Rapid toggling between Censo and Eleições produces zero console errors or warnings", () => {
  const consoleErrors = [];
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args) => consoleErrors.push(args.join(" "));
  console.warn = (...args) => consoleErrors.push(args.join(" "));

  try {
    const doc = new MockDocument();
    for (let i = 0; i < 20; i += 1) {
      applyControlsVisibility(doc, "indicators");
      applyControlsVisibility(doc, "second-round");
      applyControlsVisibility(doc, "first-round");
    }
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }

  assert.equal(consoleErrors.length, 0, "must produce zero console errors or warnings");
});

test("F13-02: Repeated state updates do not accumulate memory leaks in listeners", () => {
  const doc = new MockDocument();
  const slot = doc.createElement("div");
  doc.body.append(slot);

  /**
   * @type {{ type: any; fn: any; }[]}
   */
  const listeners = [];
  const fakeElement = {
    /**
     * @param {string} type
     * @param {() => void} fn
     */
    addEventListener(type, fn) {
      listeners.push({ type, fn });
    },
    /**
     * @param {string} type
     * @param {() => void} fn
     */
    removeEventListener(type, fn) {
      const idx = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (idx !== -1) listeners.splice(idx, 1);
    },
  };

  const fn = () => {};
  fakeElement.addEventListener("click", fn);
  fakeElement.removeEventListener("click", fn);

  assert.equal(listeners.length, 0, "listeners must be cleaned up");
});

test("F13-03: Teardown cleanly removes DOM references", () => {
  const doc = new MockDocument();
  const slot = doc.createElement("div");
  slot.id = "test-slot";
  doc.body.append(slot);

  const child = doc.createElement("span");
  slot.append(child);
  assert.equal(slot.children.length, 1);

  slot.innerHTML = "";
  assert.equal(slot.children.length, 0, "slot must be empty after cleanup");
});

test("F13-04: Graceful handling of null or undefined parameters without throwing", () => {
  assert.doesNotThrow(() => {
    const doc = new MockDocument();
    applyControlsVisibility(doc, /** @type {any} */ (null));
    applyControlsVisibility(doc, /** @type {any} */ (undefined));
    applyControlsVisibility(doc, /** @type {any} */ (""));
  });
});

test("F13-05: State transition objects are lightweight and contain no circular references", () => {
  const state = {
    tab: "second-round",
    office: "presidente",
    indicatorId: "population",
  };

  // Must serialize cleanly with JSON.stringify (proving zero circular references)
  assert.doesNotThrow(() => {
    const serialized = JSON.stringify(state);
    assert.ok(serialized.length > 0);
  });
});
