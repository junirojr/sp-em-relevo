import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  mountBottomNavView,
  NAV_TAB_COMPARE,
  NAV_TAB_INDICATORS,
  NAV_TAB_LAYERS,
  NAV_TAB_MAP,
  NAV_TAB_MUNICIPALITIES,
} from "./bottom-nav-view.js";

/**
 * Creates a mock DOM element for testing UI components without JSDOM.
 *
 * @param {string} tag
 * @returns {any}
 */
function createFakeElement(tag) {
  /**
   * @type {any[]}
   */
  const children = [];
  const attributes = new Map();
  const listeners = new Map();
  const classListSet = new Set();

  const element = {
    tagName: tag.toUpperCase(),
    get className() {
      return Array.from(classListSet).join(" ");
    },
    set className(val) {
      classListSet.clear();
      val
        .split(" ")
        .filter(Boolean)
        .forEach((c) => {
          classListSet.add(c);
        });
    },
    set innerHTML(val) {
      if (val === "") {
        children.length = 0;
      }
    },
    get innerHTML() {
      if (children.length === 0) {
        return "";
      }
      return "<children>";
    },
    textContent: "",
    children,
    type: "button",
    classList: {
      /**
       * @param {any} cls
       */
      add(cls) {
        classListSet.add(cls);
      },
      /**
       * @param {any} cls
       */
      remove(cls) {
        classListSet.delete(cls);
      },
      /**
       * @param {any} cls
       */
      contains(cls) {
        return classListSet.has(cls);
      },
    },
    /**
     * @param {any} name
     * @param {any} val
     */
    setAttribute(name, val) {
      attributes.set(name, String(val));
    },
    /**
     * @param {any} name
     */
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    /**
     * @param {any} evt
     * @param {any} handler
     */
    addEventListener(evt, handler) {
      if (!listeners.has(evt)) {
        listeners.set(evt, []);
      }
      listeners.get(evt).push(handler);
    },
    click() {
      const handlers = listeners.get("click") || [];
      for (let i = 0; i < handlers.length; i += 1) {
        handlers[i]({ target: element });
      }
    },
    /**
     * @param {any[]} nodes
     */
    append(...nodes) {
      for (let i = 0; i < nodes.length; i += 1) {
        children.push(nodes[i]);
      }
    },
    /**
     * @param {string} selector
     */
    querySelector(selector) {
      if (selector.startsWith('[data-nav-tab="')) {
        const targetTab = selector.slice(15, -2);
        return children.find((c) => c.getAttribute("data-nav-tab") === targetTab) || null;
      }
      return null;
    },
    /**
     * @param {string} selector
     */
    querySelectorAll(selector) {
      if (selector === ".bottom-nav-item") {
        return children.filter((c) => c.classList.contains("bottom-nav-item"));
      }
      return [];
    },
  };

  return element;
}

describe("Mobile bottom nav view component", () => {
  function createTestDom() {
    const container = createFakeElement("nav");
    const doc = {
      createElement: (/** @type {string} */ tag) => createFakeElement(tag),
    };
    return { doc: /** @type {Document} */ (/** @type {unknown} */ (doc)), container };
  }

  test("mounts 5 tabs with correct initial states", () => {
    const { doc, container } = createTestDom();

    const view = mountBottomNavView(doc, container, {
      activeTab: NAV_TAB_MAP,
      isElection: false,
    });

    const items = container.querySelectorAll(".bottom-nav-item");
    assert.equal(items.length, 5);

    const mapBtn = container.querySelector('[data-nav-tab="mapa"]');
    assert.ok(mapBtn);
    assert.equal(mapBtn.getAttribute("aria-pressed"), "true");
    assert.ok(mapBtn.classList.contains("active"));

    const indBtn = container.querySelector('[data-nav-tab="indicadores"]');
    assert.ok(indBtn);
    assert.equal(indBtn.getAttribute("aria-pressed"), "false");

    view.destroy();
    assert.equal(container.innerHTML, "");
  });

  test("switches active tab and triggers callback on tab click", () => {
    const { doc, container } = createTestDom();

    let selectedTab = null;
    const view = mountBottomNavView(doc, container, {
      activeTab: NAV_TAB_MAP,
      onTabSelect: (tab) => {
        selectedTab = tab;
      },
    });

    const compBtn = container.querySelector('[data-nav-tab="comparativo"]');
    assert.ok(compBtn);
    compBtn.click();

    assert.equal(selectedTab, NAV_TAB_COMPARE);
    assert.equal(compBtn.getAttribute("aria-pressed"), "true");

    const mapBtn = container.querySelector('[data-nav-tab="mapa"]');
    assert.ok(mapBtn);
    assert.equal(mapBtn.getAttribute("aria-pressed"), "false");

    view.setActiveTab(NAV_TAB_MUNICIPALITIES);
    const munBtn = container.querySelector('[data-nav-tab="municipios"]');
    assert.ok(munBtn);
    assert.equal(munBtn.getAttribute("aria-pressed"), "true");
  });

  test("toggles election mode label dynamically", () => {
    const { doc, container } = createTestDom();

    const view = mountBottomNavView(doc, container, {
      isElection: false,
    });

    let indBtn = container.querySelector('[data-nav-tab="indicadores"]');
    assert.ok(indBtn);
    assert.equal(indBtn.getAttribute("aria-label"), "Indicadores");

    view.setElectionMode(true);
    indBtn = container.querySelector('[data-nav-tab="indicadores"]');
    assert.ok(indBtn);
    assert.equal(indBtn.getAttribute("aria-label"), "Eleições");

    view.setElectionMode(false);
    indBtn = container.querySelector('[data-nav-tab="indicadores"]');
    assert.ok(indBtn);
    assert.equal(indBtn.getAttribute("aria-label"), "Indicadores");
  });
});
