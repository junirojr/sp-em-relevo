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

test("ELE-16 election mode neutralizes shell tokens to OKLab chroma at most 0.04 with double focus ring", () => {
  const cssText = fs.readFileSync(THEME_CSS_PATH, "utf-8");
  const lightElectionTokens = parseCssBlockTokens(cssText, ':root\\[data-mode="election"\\]');
  const darkElectionTokens = parseCssBlockTokens(
    cssText,
    ':root\\[data-theme="dark"\\]\\[data-mode="election"\\]',
  );

  const checkedTokenKeys = [
    "--primary",
    "--primary-soft",
    "--accent",
    "--accent-soft",
    "--coral-300",
    "--coral-400",
    "--coral-500",
    "--coral-600",
    "--coral-700",
    "--coral-900",
    "--coral-text",
    "--focus",
    "--logo-from",
    "--logo-to",
  ];

  const modes = [
    { name: "light-election", tokens: lightElectionTokens },
    { name: "dark-election", tokens: darkElectionTokens },
  ];

  for (const mode of modes) {
    for (const key of checkedTokenKeys) {
      const rawColor = mode.tokens[key];
      assert.ok(rawColor, `${mode.name} must define ${key}`);
      const lab = oklab(rawColor);
      const chroma = Math.hypot(lab.a, lab.b);
      assert.ok(
        chroma <= 0.04,
        `${mode.name} ${key} (${rawColor}) has OKLab chroma ${chroma.toFixed(4)} > 0.04`,
      );
    }
  }

  const focusRegex = /\[data-mode="election"\][^{]*:focus-visible[^{]*\{([^}]+)\}/s;
  const focusMatch = cssText.match(focusRegex);
  assert.ok(focusMatch, "Election mode must define a focus-visible rule");
  const focusBody = focusMatch[1];
  assert.ok(focusBody.includes("outline:"), "Election focus rule must include outline");
  assert.ok(
    focusBody.includes("box-shadow:"),
    "Election focus rule must include box-shadow for double ring",
  );

  const lightDefaultTokens = parseCssBlockTokens(cssText, ":root");
  const defaultFocusLab = oklab(lightDefaultTokens["--focus"]);
  const defaultFocusChroma = Math.hypot(defaultFocusLab.a, defaultFocusLab.b);
  assert.ok(defaultFocusChroma > 0.04, "Indicator mode preserves warm coral focus");
});

test("ELE-23 LAY-06 scope restriction to indicator mode and phase 1 compatibility", () => {
  const cssText = fs.readFileSync(THEME_CSS_PATH, "utf-8");
  const lightTokens = parseCssBlockTokens(cssText, ":root");
  const darkTokens = parseCssBlockTokens(cssText, ':root\\[data-theme="dark"\\]');
  const lightElectionTokens = parseCssBlockTokens(cssText, ':root\\[data-mode="election"\\]');

  for (const accentKey of ACCENT_KEYS) {
    const lightLab = oklab(lightTokens[accentKey]);
    const heatLab = oklab(lightTokens["--heat-4"]);
    assert.ok(deltaEOklab(lightLab, heatLab) >= 0.08);

    const darkLab = oklab(darkTokens[accentKey]);
    const darkHeatLab = oklab(darkTokens["--heat-4"]);
    assert.ok(deltaEOklab(darkLab, darkHeatLab) >= 0.08);
  }

  for (const accentKey of ACCENT_KEYS) {
    const electionLab = oklab(lightElectionTokens[accentKey]);
    const chroma = Math.hypot(electionLab.a, electionLab.b);
    assert.ok(
      chroma <= 0.04,
      `Election mode ${accentKey} is neutralized, not following LAY-06 red separation`,
    );
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
