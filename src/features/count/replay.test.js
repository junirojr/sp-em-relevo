import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import { mountReplayView } from "./replay-view.js";

const FIXTURE_PATH = "data/election/replay-presidente-2t.json";

function loadFixture() {
  const content = fs.readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(content);
}

/**
 * Minimal recursive selector matching for mock DOM.
 * @param {{ attributes: { class: any; id: any; }; className: any; id: any; tagName: any; }} el
 * @param {string} selector
 */
function matchesSelector(el, selector) {
  if (!el || typeof el !== "object") {
    return false;
  }
  if (selector.startsWith(".")) {
    const cls = selector.slice(1);
    const classAttr = el.attributes?.class || el.className || "";
    return classAttr.split(/\s+/).includes(cls);
  }
  if (selector.startsWith("#")) {
    const id = selector.slice(1);
    if (el.id === id) {
      return true;
    }
    return el.attributes?.id === id;
  }
  return el.tagName === selector.toUpperCase();
}

/**
 * @param {{ tagName?: any; attributes?: {}; children: any; classList?: Set<any>; style?: {}; hidden?: boolean; textContent?: string; innerHTML?: string; value?: string; min?: string; max?: string; step?: string; type?: string; parentNode?: null; setAttribute?: (name: any, val: any) => void; getAttribute?: (name: any) => any; removeAttribute?: (name: any) => void; append?: (...items: any[]) => void; querySelector?: (selector: any) => any; querySelectorAll?: (selector: any) => any[]; addEventListener?: (ev: any, cb: any) => void; removeEventListener?: (ev: any, cb: any) => void; dispatchEvent?: (event: any) => void; }} root
 * @param {any} selector
 * @returns {any}
 */
function findInTree(root, selector) {
  for (const child of root.children || []) {
    if (matchesSelector(child, selector)) {
      return child;
    }
    const found = findInTree(child, selector);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * @param {{ tagName?: any; attributes?: {}; children: any; classList?: Set<any>; style?: {}; hidden?: boolean; textContent?: string; innerHTML?: string; value?: string; min?: string; max?: string; step?: string; type?: string; parentNode?: null; setAttribute?: (name: any, val: any) => void; getAttribute?: (name: any) => any; removeAttribute?: (name: any) => void; append?: (...items: any[]) => void; querySelector?: (selector: any) => any; querySelectorAll?: (selector: any) => any[]; addEventListener?: (ev: any, cb: any) => void; removeEventListener?: (ev: any, cb: any) => void; dispatchEvent?: (event: any) => void; }} root
 * @param {any} selector
 * @param {any[]} results
 */
function collectInTree(root, selector, results) {
  for (const child of root.children || []) {
    if (matchesSelector(child, selector)) {
      results.push(child);
    }
    collectInTree(child, selector, results);
  }
}

/**
 * Creates a mock DOM Document and slot element for testing.
 */
function createMockEnvironment() {
  const elements = new Map();

  /**
   * @param {string} tag
   */
  function createElement(tag) {
    const listeners = new Map();
    /** @type {any} DOM test double. */
    const el = {
      tagName: tag.toUpperCase(),
      attributes: {},
      children: [],
      classList: new Set(),
      style: {},
      hidden: false,
      textContent: "",
      innerHTML: "",
      value: "",
      min: "",
      max: "",
      step: "",
      type: "",
      parentNode: null,
      /**
       * @param {string | number} name
       * @param {any} val
       */
      setAttribute(name, val) {
        el.attributes[name] = String(val);
      },
      /**
       * @param {string | number} name
       */
      getAttribute(name) {
        return el.attributes[name] ?? null;
      },
      /**
       * @param {string | number} name
       */
      removeAttribute(name) {
        delete el.attributes[name];
      },
      /**
       * @param {any[]} items
       */
      append(...items) {
        for (const item of items) {
          if (typeof item === "string") {
            el.children.push({ textContent: item });
            continue;
          }
          item.parentNode = el;
          el.children.push(item);
        }
      },
      /**
       * @param {any} selector
       */
      querySelector(selector) {
        return findInTree(el, selector);
      },
      /**
       * @param {any} selector
       */
      querySelectorAll(selector) {
        /**
         * @type {any[]}
         */
        const results = [];
        collectInTree(el, selector, results);
        return results;
      },
      /**
       * @param {any} ev
       * @param {any} cb
       */
      addEventListener(ev, cb) {
        if (!listeners.has(ev)) {
          listeners.set(ev, []);
        }
        listeners.get(ev).push(cb);
      },
      /**
       * @param {any} ev
       * @param {any} cb
       */
      removeEventListener(ev, cb) {
        if (listeners.has(ev)) {
          const list = listeners.get(ev).filter((/** @type {any} */ fn) => fn !== cb);
          listeners.set(ev, list);
        }
      },
      /**
       * @param {{ type: any; }} event
       */
      dispatchEvent(event) {
        const cbs = listeners.get(event.type) || [];
        for (const cb of cbs) {
          cb(event);
        }
      },
    };
    return el;
  }

  /** @type {any} DOM test double. */
  const documentRef = {
    createElement,
    /**
     * @param {string} id
     */
    getElementById(id) {
      if (!elements.has(id)) {
        const el = createElement("div");
        el.id = id;
        elements.set(id, el);
      }
      return elements.get(id);
    },
  };

  const slotElement = documentRef.getElementById("election-replay-slot");
  return { documentRef, slotElement };
}

describe("Replay View Component Suite (N17, RPL-01, RPL-03, RPL-04, RPL-05, ACE-04)", () => {
  it("RPL-01: hides slot without error when replay is unavailable or missing doc", () => {
    const { documentRef, slotElement } = createMockEnvironment();

    // Unavailable
    const view1 = mountReplayView(documentRef, slotElement, {
      isAvailable: false,
      replayDoc: loadFixture(),
    });
    assert.equal(slotElement.hidden, true);
    view1.destroy();

    // Missing doc
    const view2 = mountReplayView(documentRef, slotElement, {
      isAvailable: true,
      replayDoc: null,
    });
    assert.equal(slotElement.hidden, true);
    view2.destroy();

    // Empty frames
    const view3 = mountReplayView(documentRef, slotElement, {
      isAvailable: true,
      replayDoc: { frames: [] },
    });
    assert.equal(slotElement.hidden, true);
    view3.destroy();
  });

  it("RPL-03: opens automatically at last recorded frame with correct banner and never 'Ao vivo'", () => {
    const { documentRef, slotElement } = createMockEnvironment();
    const fixture = loadFixture();
    const totalFrames = fixture.frames.length;
    const lastIdx = totalFrames - 1;

    let receivedBanner = "";
    const view = mountReplayView(documentRef, slotElement, {
      isAvailable: true,
      replayDoc: fixture,
      onBannerTextChange: (txt) => {
        receivedBanner = txt;
      },
    });

    assert.equal(slotElement.hidden, false);
    assert.equal(view.getCurrentIndex(), lastIdx);

    const bannerNotice = slotElement.querySelector(".replay-banner-notice");
    assert.ok(bannerNotice);
    assert.equal(bannerNotice.textContent, "Gravacao de 25/10, leitura das 17:20 (Brasilia)");
    assert.equal(receivedBanner, "Gravacao de 25/10, leitura das 17:20 (Brasilia)");

    // Invariant: Never contains "Ao vivo"
    assert.equal(bannerNotice.textContent.includes("Ao vivo"), false);
    assert.equal(bannerNotice.textContent.includes("\u2013"), false);
    assert.equal(bannerNotice.textContent.includes("\u2014"), false);

    view.destroy();
  });

  it("RPL-04: slider input has correct range, step, aria attributes, and keyboard navigation", () => {
    const { documentRef, slotElement } = createMockEnvironment();
    const fixture = loadFixture();
    const totalFrames = fixture.frames.length;
    const lastIdx = totalFrames - 1;

    const frameChanges = [];
    const view = mountReplayView(documentRef, slotElement, {
      isAvailable: true,
      replayDoc: fixture,
      onFrameChange: (f) => {
        frameChanges.push(f);
      },
    });

    const slider = slotElement.querySelector(".replay-slider");
    assert.ok(slider);
    assert.equal(slider.type, "range");
    assert.equal(slider.min, "0");
    assert.equal(slider.max, String(lastIdx));
    assert.equal(slider.step, "1");
    assert.equal(slider.value, String(lastIdx));

    // Accessible attributes
    assert.equal(slider.getAttribute("aria-label"), "Controle de tempo do replay");
    assert.equal(slider.getAttribute("aria-valuemin"), "0");
    assert.equal(slider.getAttribute("aria-valuemax"), String(lastIdx));
    assert.equal(slider.getAttribute("aria-valuenow"), String(lastIdx));
    assert.equal(slider.getAttribute("aria-valuetext"), "17:20 - 100,00% apurado");

    // Keyboard navigation: Home goes to frame 0
    slider.dispatchEvent({
      type: "keydown",
      key: "Home",
      preventDefault() {},
    });
    assert.equal(view.getCurrentIndex(), 0);
    assert.equal(slider.value, "0");
    assert.equal(slider.getAttribute("aria-valuenow"), "0");
    assert.equal(slider.getAttribute("aria-valuetext"), "17:00 - 8,50% apurado");

    // Keyboard navigation: ArrowRight advances frame
    slider.dispatchEvent({
      type: "keydown",
      key: "ArrowRight",
      preventDefault() {},
    });
    assert.equal(view.getCurrentIndex(), 1);
    assert.equal(slider.value, "1");

    // Keyboard navigation: ArrowLeft returns to previous
    slider.dispatchEvent({
      type: "keydown",
      key: "ArrowLeft",
      preventDefault() {},
    });
    assert.equal(view.getCurrentIndex(), 0);

    // Keyboard navigation: End goes to last frame
    slider.dispatchEvent({
      type: "keydown",
      key: "End",
      preventDefault() {},
    });
    assert.equal(view.getCurrentIndex(), lastIdx);
    assert.equal(slider.value, String(lastIdx));

    view.destroy();
  });

  it("RPL-05: slider input triggers immediate callback without smoothing and marks real gaps > 300s", () => {
    const { documentRef, slotElement } = createMockEnvironment();
    const fixture = loadFixture();

    /** @type {any[]} */
    const appliedFrames = [];
    const view = mountReplayView(documentRef, slotElement, {
      isAvailable: true,
      replayDoc: fixture,
      onFrameChange: (f) => {
        appliedFrames.push(f);
      },
    });

    // Gap indicators rendered on track
    const gapIndicators = slotElement.querySelectorAll(".replay-gap-indicator");
    assert.equal(gapIndicators.length, 1);
    assert.ok(gapIndicators[0].getAttribute("title").includes("Lacuna"));

    // Gap notice should be hidden initially at last frame (frame 14 has no gap before it)
    const gapNotice = slotElement.querySelector(".replay-gap-notice");
    assert.equal(gapNotice.hidden, true);

    // Move slider to frame 6 (the frame directly following the 420s gap)
    const slider = slotElement.querySelector(".replay-slider");
    slider.value = "6";
    slider.dispatchEvent({ type: "input", target: slider });

    assert.equal(view.getCurrentIndex(), 6);
    const currentF = view.getCurrentFrame();
    assert.ok(currentF);
    assert.equal(currentF.isGap, true);
    assert.equal(currentF.gapBeforeSeconds, 420);

    // Gap notice is displayed for frame 6
    assert.equal(gapNotice.hidden, false);
    const gapText = slotElement.querySelector(".replay-gap-text");
    assert.ok(gapText.textContent.includes("7 minutos"));

    // Move to frame 5 (prior to gap)
    slider.value = "5";
    slider.dispatchEvent({ type: "input", target: slider });
    assert.equal(gapNotice.hidden, true);

    // Verify callbacks were dispatched immediately for each step
    assert.ok(appliedFrames.length >= 3);

    view.destroy();
  });

  it("ACE-04: navigation toolbar buttons allow frame step and boundary jumps", () => {
    const { documentRef, slotElement } = createMockEnvironment();
    const fixture = loadFixture();
    const lastIdx = fixture.frames.length - 1;

    const view = mountReplayView(documentRef, slotElement, {
      isAvailable: true,
      replayDoc: fixture,
    });

    const btnFirst = slotElement.querySelector(".replay-btn-first");
    const btnPrev = slotElement.querySelector(".replay-btn-prev");
    const btnNext = slotElement.querySelector(".replay-btn-next");
    const btnLast = slotElement.querySelector(".replay-btn-last");
    const counter = slotElement.querySelector(".replay-frame-counter");

    assert.ok(btnFirst);
    assert.ok(btnPrev);
    assert.ok(btnNext);
    assert.ok(btnLast);
    assert.equal(counter.textContent, `Quadro ${lastIdx + 1} de ${lastIdx + 1}`);

    // Click first
    btnFirst.dispatchEvent({ type: "click" });
    assert.equal(view.getCurrentIndex(), 0);
    assert.equal(counter.textContent, `Quadro 1 de ${lastIdx + 1}`);

    // Click next
    btnNext.dispatchEvent({ type: "click" });
    assert.equal(view.getCurrentIndex(), 1);
    assert.equal(counter.textContent, `Quadro 2 de ${lastIdx + 1}`);

    // Click prev
    btnPrev.dispatchEvent({ type: "click" });
    assert.equal(view.getCurrentIndex(), 0);

    // Click last
    btnLast.dispatchEvent({ type: "click" });
    assert.equal(view.getCurrentIndex(), lastIdx);

    view.destroy();
  });

  it("supports dynamic document updates via setReplayDoc and update()", () => {
    const { documentRef, slotElement } = createMockEnvironment();
    const fixture = loadFixture();

    const view = mountReplayView(documentRef, slotElement, {
      isAvailable: false,
    });
    assert.equal(slotElement.hidden, true);

    // Enable via update
    view.update({ isAvailable: true, replayDoc: fixture });
    assert.equal(slotElement.hidden, false);
    assert.equal(view.getCurrentIndex(), fixture.frames.length - 1);

    // Update with null
    view.setReplayDoc(null);
    assert.equal(slotElement.hidden, true);

    view.destroy();
  });
});
