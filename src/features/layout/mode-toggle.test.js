import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  MODE_ELECTION,
  MODE_INDICATORS,
  mountModeToggle,
  resolveActiveMode,
  resolveModeFromTab,
  TAB_FIRST_ROUND,
  TAB_INDICATORS,
  TAB_SECOND_ROUND,
} from "./mode-toggle-view.js";

/**
 * Creates a mock DOM environment for testing mode-toggle UI component in Node.
 */
function createTestDom() {
  /**
   * @type {{ tagName: any; dataset: {}; className: string; readonly children: any[]; textContent: string; innerHTML: string; setAttribute(name: any, val: any): void; getAttribute(name: any): any; removeAttribute(name: any): void; addEventListener(event: any, handler: any): void; dispatchEvent(event: any): void; click(): void; focus(): void; append(...nodes: any[]): void; remove(): void; querySelector(selector: any): any; querySelectorAll(selector: any): any[]; } | null}
   */
  let activeElement = null;

  /**
   * @param {string} tag
   */
  function createFakeElement(tag) {
    /**
     * @type {any[]}
     */
    const children = [];
    const attributes = new Map();
    const listeners = new Map();
    /** @type {Record<string, string>} */
    const dataset = {};
    const classListSet = new Set();

    /** @type {any} Test double implements only the DOM methods used by this view. */
    const el = {
      tagName: tag.toUpperCase(),
      dataset,
      get className() {
        return Array.from(classListSet).join(" ");
      },
      set className(val) {
        classListSet.clear();
        for (const c of val.split(" ").filter(Boolean)) {
          classListSet.add(c);
        }
      },
      get children() {
        return children;
      },
      textContent: "",
      innerHTML: "",
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
       * @param {any} name
       */
      removeAttribute(name) {
        attributes.delete(name);
      },
      /**
       * @param {any} event
       * @param {any} handler
       */
      addEventListener(event, handler) {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event).push(handler);
      },
      /**
       * @param {{ type: any; target?: { tagName: any; dataset: {}; className: string; readonly children: any[]; textContent: string; innerHTML: string; setAttribute(name: any, val: any): void; getAttribute(name: any): any; removeAttribute(name: any): void; addEventListener(event: any, handler: any): void; dispatchEvent(event: any): void; click(): void; focus(): void; append(...nodes: any[]): void; remove(): void; querySelector(selector: any): any; querySelectorAll(selector: any): any[]; }; }} event
       */
      dispatchEvent(event) {
        const handlers = listeners.get(event.type) || [];
        for (const handler of handlers) {
          handler(event);
        }
      },
      click() {
        el.dispatchEvent({ type: "click", target: el });
      },
      focus() {
        activeElement = el;
      },
      /**
       * @param {any[]} nodes
       */
      append(...nodes) {
        for (const node of nodes) {
          node._parent = el;
          children.push(node);
        }
      },
      remove() {
        if (el._parent) {
          const idx = el._parent.children.indexOf(el);
          if (idx !== -1) {
            el._parent.children.splice(idx, 1);
          }
        }
      },
      /**
       * @param {any} selector
       */
      querySelector(selector) {
        return children.find((c) => matchesSelector(c, selector)) || null;
      },
      /**
       * @param {any} selector
       */
      querySelectorAll(selector) {
        return children.filter((c) => matchesSelector(c, selector));
      },
    };

    return el;
  }

  /**
   * @param {{ className: string; dataset: { mode: any; }; tagName: string; }} el
   * @param {string} selector
   */
  function matchesSelector(el, selector) {
    if (selector.startsWith(".")) {
      const cls = selector.slice(1);
      return el.className.split(" ").includes(cls);
    }
    if (selector.startsWith('[data-mode="')) {
      const mode = selector.slice(12, -2);
      return el.dataset.mode === mode;
    }
    if (selector === "button") {
      return el.tagName === "BUTTON";
    }
    return false;
  }

  const container = createFakeElement("div");
  const doc = {
    get activeElement() {
      return activeElement;
    },
    createElement: (/** @type {any} */ tag) => createFakeElement(tag),
  };

  return { doc: /** @type {Document} */ (/** @type {unknown} */ (doc)), container };
}

describe("resolveModeFromTab", () => {
  test("returns MODE_INDICATORS for indicators tab or undefined", () => {
    assert.equal(resolveModeFromTab(TAB_INDICATORS), MODE_INDICATORS);
    assert.equal(resolveModeFromTab(undefined), MODE_INDICATORS);
    assert.equal(resolveModeFromTab("unknown"), MODE_INDICATORS);
  });

  test("returns MODE_ELECTION for second-round and first-round tabs", () => {
    assert.equal(resolveModeFromTab(TAB_SECOND_ROUND), MODE_ELECTION);
    assert.equal(resolveModeFromTab(TAB_FIRST_ROUND), MODE_ELECTION);
  });

  test("resolveActiveMode is an alias of resolveModeFromTab", () => {
    assert.equal(resolveActiveMode, resolveModeFromTab);
  });
});

describe("mountModeToggle DOM rendering and accessibility", () => {
  test("renders segmented pill control with role='group' and aria-label", () => {
    const { doc, container } = createTestDom();
    const toggle = mountModeToggle(container, {
      activeTab: TAB_INDICATORS,
      documentRef: doc,
    });

    assert.equal(toggle.element.className, "mode-toggle");
    assert.equal(toggle.element.getAttribute("role"), "group");
    assert.equal(toggle.element.getAttribute("aria-label"), "Modo de visualização");
    assert.equal(container.children.length, 1);
    assert.equal(container.children[0], toggle.element);
  });

  test("renders 2 buttons with permanent aria-labels and semantic attributes", () => {
    const { doc, container } = createTestDom();
    const toggle = mountModeToggle(container, {
      activeTab: TAB_INDICATORS,
      documentRef: doc,
    });

    const buttons = toggle.element.querySelectorAll("button");
    assert.equal(buttons.length, 2);

    const [btnIndicators, btnElection] = buttons;
    assert.equal(btnIndicators.getAttribute("aria-label"), "Censo IBGE");
    assert.equal(btnIndicators.dataset.mode, MODE_INDICATORS);
    assert.equal(btnIndicators.dataset.tab, TAB_INDICATORS);
    assert.equal(btnIndicators.getAttribute("aria-pressed"), "true");

    assert.equal(btnElection.getAttribute("aria-label"), "Eleições TSE");
    assert.equal(btnElection.dataset.mode, MODE_ELECTION);
    assert.equal(btnElection.dataset.tab, TAB_SECOND_ROUND);
    assert.equal(btnElection.getAttribute("aria-pressed"), "false");
  });

  test("initializes active button to election when activeTab is second-round or first-round", () => {
    const { doc, container } = createTestDom();
    const toggle = mountModeToggle(container, {
      activeTab: TAB_SECOND_ROUND,
      documentRef: doc,
    });

    const [btnIndicators, btnElection] = toggle.element.querySelectorAll("button");
    assert.equal(btnIndicators.getAttribute("aria-pressed"), "false");
    assert.equal(btnElection.getAttribute("aria-pressed"), "true");

    const { doc: doc2, container: container2 } = createTestDom();
    const toggle2 = mountModeToggle(container2, {
      activeTab: TAB_FIRST_ROUND,
      documentRef: doc2,
    });

    const [btnInd2, btnElec2] = toggle2.element.querySelectorAll("button");
    assert.equal(btnInd2.getAttribute("aria-pressed"), "false");
    assert.equal(btnElec2.getAttribute("aria-pressed"), "true");
  });

  test("contains full and short labels for responsive layouts", () => {
    const { doc, container } = createTestDom();
    const toggle = mountModeToggle(container, {
      activeTab: TAB_INDICATORS,
      documentRef: doc,
    });

    const buttons = toggle.element.querySelectorAll("button");
    const [btnIndicators, btnElection] = buttons;

    const indText = Array.from(btnIndicators.children).find(
      (/** @type {{ className: string; }} */ c) => c.className === "mode-toggle-text",
    );
    assert.ok(indText);
    const indFull = Array.from(indText.children).find(
      (/** @type {{ className: string; }} */ c) => c.className === "mode-toggle-label-full",
    );
    const indShort = Array.from(indText.children).find(
      (/** @type {{ className: string; }} */ c) => c.className === "mode-toggle-label-short",
    );
    assert.ok(indFull);
    assert.equal(indFull.textContent, "Censo IBGE");
    assert.ok(indShort);
    assert.equal(indShort.textContent, "Censo");
    assert.equal(indShort.getAttribute("aria-hidden"), "true");

    const elecText = Array.from(btnElection.children).find(
      (/** @type {{ className: string; }} */ c) => c.className === "mode-toggle-text",
    );
    assert.ok(elecText);
    const elecFull = Array.from(elecText.children).find(
      (/** @type {{ className: string; }} */ c) => c.className === "mode-toggle-label-full",
    );
    const elecShort = Array.from(elecText.children).find(
      (/** @type {{ className: string; }} */ c) => c.className === "mode-toggle-label-short",
    );
    assert.ok(elecFull);
    assert.equal(elecFull.textContent, "Eleições TSE");
    assert.ok(elecShort);
    assert.equal(elecShort.textContent, "Eleições");
    assert.equal(elecShort.getAttribute("aria-hidden"), "true");
  });
});

describe("mountModeToggle interactions and state synchronization", () => {
  test("clicking Eleições TSE dispatches onSelectTab('second-round') and updates aria-pressed", () => {
    const { doc, container } = createTestDom();
    /**
     * @type {string[]}
     */
    const selectedTabs = [];
    const toggle = mountModeToggle(container, {
      activeTab: TAB_INDICATORS,
      documentRef: doc,
      onSelectTab: (tab) => selectedTabs.push(tab),
    });

    const [btnIndicators, btnElection] = toggle.element.querySelectorAll("button");
    btnElection.click();

    assert.deepEqual(selectedTabs, [TAB_SECOND_ROUND]);
    assert.equal(btnIndicators.getAttribute("aria-pressed"), "false");
    assert.equal(btnElection.getAttribute("aria-pressed"), "true");
  });

  test("clicking Censo IBGE dispatches onSelectTab('indicators') when currently in election mode", () => {
    const { doc, container } = createTestDom();
    /**
     * @type {string[]}
     */
    const selectedTabs = [];
    const toggle = mountModeToggle(container, {
      activeTab: TAB_SECOND_ROUND,
      documentRef: doc,
      onSelectTab: (tab) => selectedTabs.push(tab),
    });

    const [btnIndicators, btnElection] = toggle.element.querySelectorAll("button");
    btnIndicators.click();

    assert.deepEqual(selectedTabs, [TAB_INDICATORS]);
    assert.equal(btnIndicators.getAttribute("aria-pressed"), "true");
    assert.equal(btnElection.getAttribute("aria-pressed"), "false");
  });

  test("clicking currently active mode does not re-dispatch callback", () => {
    const { doc, container } = createTestDom();
    const selectedTabs = [];
    const toggle = mountModeToggle(container, {
      activeTab: TAB_INDICATORS,
      documentRef: doc,
      onSelectTab: (tab) => selectedTabs.push(tab),
    });

    const [btnIndicators] = toggle.element.querySelectorAll("button");
    btnIndicators.click();

    assert.equal(selectedTabs.length, 0);
  });

  test("update(nextTab) updates aria-pressed reactively from external store changes", () => {
    const { doc, container } = createTestDom();
    const toggle = mountModeToggle(container, {
      activeTab: TAB_INDICATORS,
      documentRef: doc,
    });

    const [btnIndicators, btnElection] = toggle.element.querySelectorAll("button");
    assert.equal(btnIndicators.getAttribute("aria-pressed"), "true");
    assert.equal(btnElection.getAttribute("aria-pressed"), "false");

    toggle.update(TAB_SECOND_ROUND);
    assert.equal(btnIndicators.getAttribute("aria-pressed"), "false");
    assert.equal(btnElection.getAttribute("aria-pressed"), "true");

    toggle.update(TAB_FIRST_ROUND);
    assert.equal(btnIndicators.getAttribute("aria-pressed"), "false");
    assert.equal(btnElection.getAttribute("aria-pressed"), "true");

    toggle.update(TAB_INDICATORS);
    assert.equal(btnIndicators.getAttribute("aria-pressed"), "true");
    assert.equal(btnElection.getAttribute("aria-pressed"), "false");
  });

  test("destroy() removes root element from DOM", () => {
    const { doc, container } = createTestDom();
    const toggle = mountModeToggle(container, {
      activeTab: TAB_INDICATORS,
      documentRef: doc,
    });

    assert.equal(container.children.length, 1);
    toggle.destroy();
    assert.equal(container.children.length, 0);
  });
});

describe("mountModeToggle keyboard navigation (WCAG 2.1.1)", () => {
  test("ArrowRight and ArrowDown advance focus to next button and cycle", () => {
    const { doc, container } = createTestDom();
    const toggle = mountModeToggle(container, {
      activeTab: TAB_INDICATORS,
      documentRef: doc,
    });

    const [btnIndicators, btnElection] = toggle.element.querySelectorAll("button");

    btnIndicators.focus();
    assert.equal(doc.activeElement, btnIndicators);

    let defaultPrevented = false;
    toggle.element.dispatchEvent(
      /** @type {KeyboardEvent} */ (
        /** @type {unknown} */ ({
          type: "keydown",
          key: "ArrowRight",
          preventDefault: () => {
            defaultPrevented = true;
          },
        })
      ),
    );
    assert.equal(doc.activeElement, btnElection);
    assert.equal(defaultPrevented, true);

    // Cycling from last to first
    defaultPrevented = false;
    toggle.element.dispatchEvent(
      /** @type {KeyboardEvent} */ (
        /** @type {unknown} */ ({
          type: "keydown",
          key: "ArrowDown",
          preventDefault: () => {
            defaultPrevented = true;
          },
        })
      ),
    );
    assert.equal(doc.activeElement, btnIndicators);
    assert.equal(defaultPrevented, true);
  });

  test("ArrowLeft and ArrowUp move focus to previous button and cycle", () => {
    const { doc, container } = createTestDom();
    const toggle = mountModeToggle(container, {
      activeTab: TAB_INDICATORS,
      documentRef: doc,
    });

    const [btnIndicators, btnElection] = toggle.element.querySelectorAll("button");

    btnIndicators.focus();
    assert.equal(doc.activeElement, btnIndicators);

    // ArrowLeft from first cycles to last
    let defaultPrevented = false;
    toggle.element.dispatchEvent(
      /** @type {KeyboardEvent} */ (
        /** @type {unknown} */ ({
          type: "keydown",
          key: "ArrowLeft",
          preventDefault: () => {
            defaultPrevented = true;
          },
        })
      ),
    );
    assert.equal(doc.activeElement, btnElection);
    assert.equal(defaultPrevented, true);

    // ArrowUp moves to previous
    defaultPrevented = false;
    toggle.element.dispatchEvent(
      /** @type {KeyboardEvent} */ (
        /** @type {unknown} */ ({
          type: "keydown",
          key: "ArrowUp",
          preventDefault: () => {
            defaultPrevented = true;
          },
        })
      ),
    );
    assert.equal(doc.activeElement, btnIndicators);
    assert.equal(defaultPrevented, true);
  });

  test("Home and End focus first and last buttons", () => {
    const { doc, container } = createTestDom();
    const toggle = mountModeToggle(container, {
      activeTab: TAB_INDICATORS,
      documentRef: doc,
    });

    const [btnIndicators, btnElection] = toggle.element.querySelectorAll("button");

    btnIndicators.focus();

    toggle.element.dispatchEvent(
      /** @type {KeyboardEvent} */ (
        /** @type {unknown} */ ({
          type: "keydown",
          key: "End",
          preventDefault: () => {},
        })
      ),
    );
    assert.equal(doc.activeElement, btnElection);

    toggle.element.dispatchEvent(
      /** @type {KeyboardEvent} */ (
        /** @type {unknown} */ ({
          type: "keydown",
          key: "Home",
          preventDefault: () => {},
        })
      ),
    );
    assert.equal(doc.activeElement, btnIndicators);
  });

  test("ignores unrelated keys like Tab or Escape", () => {
    const { doc, container } = createTestDom();
    const toggle = mountModeToggle(container, {
      activeTab: TAB_INDICATORS,
      documentRef: doc,
    });

    const [btnIndicators] = toggle.element.querySelectorAll("button");
    btnIndicators.focus();

    let defaultPrevented = false;
    toggle.element.dispatchEvent(
      /** @type {KeyboardEvent} */ (
        /** @type {unknown} */ ({
          type: "keydown",
          key: "Tab",
          preventDefault: () => {
            defaultPrevented = true;
          },
        })
      ),
    );
    assert.equal(defaultPrevented, false);
    assert.equal(doc.activeElement, btnIndicators);
  });
});
