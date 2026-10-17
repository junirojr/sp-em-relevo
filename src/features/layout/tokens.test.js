import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { deltaEOklab, oklab } from "../../../tests/support/oklab.js";
import { mountLayoutToggle } from "./layout-view.js";

const THEME_CSS_PATH = path.resolve(process.cwd(), "src/app/theme.css");

const HEAT_KEYS = [
  "--heat-1",
  "--heat-2",
  "--heat-3",
  "--heat-4",
  "--heat-5",
  "--heat-6",
  "--heat-7",
];

const ACCENT_KEYS = ["--primary", "--primary-soft", "--accent", "--accent-soft"];

test("LAY-05 mountLayoutToggle initializes button with aria-expanded true", () => {
  const fakeElement = createFakeElement("div", "sidebar");
  const fakeDoc = createFakeDocument();

  const toggleView = mountLayoutToggle(fakeDoc, fakeElement);
  assert.equal(toggleView.isExpanded(), true);
  assert.equal(toggleView.element.getAttribute("aria-expanded"), "true");
  assert.equal(toggleView.element.getAttribute("aria-label"), "Recolher barra lateral");
  assert.equal(fakeElement.classList.contains("collapsed"), false);
});

test("LAY-05 mountLayoutToggle toggles aria-expanded and collapsed class", () => {
  const fakeElement = createFakeElement("div", "sidebar");
  const fakeDoc = createFakeDocument();
  let reportedState = null;

  const toggleView = mountLayoutToggle(fakeDoc, fakeElement, (expanded) => {
    reportedState = expanded;
  });

  toggleView.toggle();
  assert.equal(toggleView.isExpanded(), false);
  assert.equal(toggleView.element.getAttribute("aria-expanded"), "false");
  assert.equal(toggleView.element.getAttribute("aria-label"), "Expandir barra lateral");
  assert.equal(fakeElement.classList.contains("collapsed"), true);
  assert.equal(reportedState, false);

  toggleView.toggle();
  assert.equal(toggleView.isExpanded(), true);
  assert.equal(toggleView.element.getAttribute("aria-expanded"), "true");
  assert.equal(toggleView.element.getAttribute("aria-label"), "Recolher barra lateral");
  assert.equal(fakeElement.classList.contains("collapsed"), false);
  assert.equal(reportedState, true);
});

test("LAY-06 every accent token is at least 0.08 deltaE OKLab from heat reds and selection blue", () => {
  const cssText = fs.readFileSync(THEME_CSS_PATH, "utf-8");
  const lightTokens = parseCssBlockTokens(cssText, ":root");
  const darkTokens = parseCssBlockTokens(cssText, ':root\\[data-theme="dark"\\]');

  const themes = [
    { name: "light", tokens: lightTokens },
    { name: "dark", tokens: darkTokens },
  ];

  for (const theme of themes) {
    const reds = HEAT_KEYS.map((k) => oklab(theme.tokens[k]));
    const blue = oklab(theme.tokens["--selection"]);

    for (const accentKey of ACCENT_KEYS) {
      const accentHex = theme.tokens[accentKey];
      assert.ok(accentHex, `Token ${accentKey} must exist in ${theme.name}`);
      const accentLab = oklab(accentHex);

      for (let i = 0; i < reds.length; i += 1) {
        const dRed = deltaEOklab(accentLab, reds[i]);
        assert.ok(
          dRed >= 0.08,
          `${theme.name} ${accentKey} (${accentHex}) too close to ${HEAT_KEYS[i]}: deltaE=${dRed.toFixed(4)} < 0.08`,
        );
      }

      const dBlue = deltaEOklab(accentLab, blue);
      assert.ok(
        dBlue >= 0.08,
        `${theme.name} ${accentKey} (${accentHex}) too close to selection blue: deltaE=${dBlue.toFixed(4)} < 0.08`,
      );
    }
  }
});

/**
 * @param {string} cssText
 * @param {string} blockSelector
 * @returns {Record<string, string>}
 */
function parseCssBlockTokens(cssText, blockSelector) {
  const blockRegex = new RegExp(`${blockSelector}\\s*\\{([^\\}]+)\\}`, "s");
  const match = cssText.match(blockRegex);
  if (!match) {
    return {};
  }
  /** @type {Record<string, string>} */
  const tokens = {};
  for (const line of match[1].split(";")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("--")) {
      continue;
    }
    const parts = trimmed.split(":");
    const key = parts[0].trim();
    const val = parts.slice(1).join(":").trim();
    if (key && val) {
      tokens[key] = val;
    }
  }
  return tokens;
}

function createFakeDocument() {
  return /** @type {any} */ ({
    createElement(/** @type {string} */ tag) {
      return createFakeElement(tag);
    },
  });
}

/**
 * @param {string} tag
 * @param {string} [id]
 */
function createFakeElement(tag, id = "") {
  /** @type {Record<string, string>} */
  const attrs = {};
  /** @type {Set<string>} */
  const classList = new Set();
  /** @type {Record<string, Function[]>} */
  const listeners = {};

  return /** @type {any} */ ({
    tagName: tag.toUpperCase(),
    id,
    textContent: "",
    setAttribute(/** @type {string} */ name, /** @type {string} */ value) {
      attrs[name] = value;
    },
    getAttribute(/** @type {string} */ name) {
      return attrs[name] || null;
    },
    classList: {
      add(/** @type {string} */ cls) {
        classList.add(cls);
      },
      remove(/** @type {string} */ cls) {
        classList.delete(cls);
      },
      contains(/** @type {string} */ cls) {
        return classList.has(cls);
      },
      toggle(/** @type {string} */ cls) {
        if (classList.has(cls)) {
          classList.delete(cls);
          return false;
        }
        classList.add(cls);
        return true;
      },
    },
    addEventListener(/** @type {string} */ event, /** @type {Function} */ fn) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(fn);
    },
    click() {
      if (listeners.click) {
        for (const fn of listeners.click) {
          fn();
        }
      }
    },
  });
}
