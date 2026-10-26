import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { clickUnit, inspect, readSelection } from "../../../tests/support/inspector.js";
import { openPage, settle } from "../../../tests/support/page.js";
import { parseMunicipalities } from "../../app/data-loader.js";

/**
 * @typedef {import("@playwright/test").Browser} Browser
 * @typedef {import("@playwright/test").Page} Page
 */

const VIEWPORT_1280_900 = { width: 1280, height: 900 };
const SAO_PAULO_CODE = "3550308";
const TAB_ANCHOR = "#class-filter";
const RANKING_ROW = ".selection-ranking-row";
const REMOVE_BUTTON = ".selection-remove-button";
const ROW_VALUE_CELL = ".selection-cell-value";
const MAX_TAB_PRESSES = 12;

const regionCodeByMunicipality = readRegionCodeByMunicipality();

test.describe("Selection panel by keyboard (SEL-08, SEL-09)", () => {
  test("SEL-08 each ranking row is one Tab stop and that stop is a native button", async ({
    browser,
  }) => {
    await withOpenPage(browser, async (page) => {
      await tabUntilFocusInside(page, RANKING_ROW);
      expect(await readFocusedTagName(page)).toBe("BUTTON");
      expect(await readFocusedRowIndex(page)).toBe(0);

      await page.keyboard.press("Tab");
      expect(await readFocusedRowIndex(page)).toBe(1);
    });
  });

  test("SEL-08 on the municipality level, Tab reaches a ranking unit and Enter selects it", async ({
    browser,
  }) => {
    await expectMunicipalitySelectedBy(browser, "Enter");
  });

  test("SEL-08 on the municipality level, Tab reaches a ranking unit and Space selects it", async ({
    browser,
  }) => {
    await expectMunicipalitySelectedBy(browser, "Space");
  });

  test("SEL-08 on the region level, Tab reaches a ranking unit and Enter selects the whole region", async ({
    browser,
  }) => {
    await expectWholeRegionSelectedBy(browser, "Enter");
  });

  test("SEL-08 on the region level, Tab reaches a ranking unit and Space selects the whole region", async ({
    browser,
  }) => {
    await expectWholeRegionSelectedBy(browser, "Space");
  });

  test("SEL-09 keyboard focus on the remove button of a selected row raises the unit and leaving drops it", async ({
    browser,
  }) => {
    await withOpenPage(browser, async (page) => {
      await selectSaoPauloAndRestPointer(page);
      expect((await inspect(page, SAO_PAULO_CODE)).isPointed).toBe(false);

      await tabUntilFocusInside(page, REMOVE_BUTTON);
      await settle(page);
      const focused = await inspect(page, SAO_PAULO_CODE);
      expect(focused.isSelected).toBe(true);
      expect(focused.isPointed).toBe(true);

      await page.keyboard.press("Shift+Tab");
      await settle(page);
      const left = await inspect(page, SAO_PAULO_CODE);
      expect(left.isPointed).toBe(false);
    });
  });

  test("SEL-09 focus moving inside the same row keeps the unit raised", async ({ browser }) => {
    await withOpenPage(browser, async (page) => {
      await selectSaoPauloAndRestPointer(page);
      await tabUntilFocusInside(page, REMOVE_BUTTON);
      await settle(page);
      expect((await inspect(page, SAO_PAULO_CODE)).isPointed).toBe(true);

      await dispatchFocusOutToSameRow(page);
      await settle(page);
      expect((await inspect(page, SAO_PAULO_CODE)).isPointed).toBe(true);
    });
  });

  test("SEL-08 selecting a ranking row by keyboard moves focus to the remove button in the selection table", async ({
    browser,
  }) => {
    await withOpenPage(browser, async (page) => {
      await tabUntilFocusInside(page, RANKING_ROW);
      await page.keyboard.press("Enter");
      await settle(page);

      expect(await isFocusInside(page, REMOVE_BUTTON)).toBe(true);
    });
  });

  test("SEL-06 removing the only selected unit moves focus back to the ranking button", async ({
    browser,
  }) => {
    await withOpenPage(browser, async (page) => {
      await tabUntilFocusInside(page, RANKING_ROW);
      await page.keyboard.press("Enter");
      await settle(page);

      expect(await isFocusInside(page, REMOVE_BUTTON)).toBe(true);

      await page.keyboard.press("Enter");
      await settle(page);

      expect(await isFocusInside(page, RANKING_ROW)).toBe(true);
    });
  });
});

/**
 * @param {Browser} browser
 * @param {(page: Page) => Promise<void>} body
 */
async function withOpenPage(browser, body) {
  const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
  try {
    await body(page);
  } finally {
    await context.close();
  }
}

/**
 * @param {Browser} browser
 * @param {"Enter" | "Space"} key
 */
async function expectMunicipalitySelectedBy(browser, key) {
  await withOpenPage(browser, async (page) => {
    await tabUntilFocusInside(page, RANKING_ROW);
    await page.keyboard.press(key);
    await settle(page);

    expect(await readSelection(page)).toEqual([SAO_PAULO_CODE]);
  });
}

/**
 * @param {Browser} browser
 * @param {"Enter" | "Space"} key
 */
async function expectWholeRegionSelectedBy(browser, key) {
  await withOpenPage(browser, async (page) => {
    await switchToRegionLevel(page);
    await tabUntilFocusInside(page, RANKING_ROW);
    await page.keyboard.press(key);
    await settle(page);

    expectExactlyOneWholeRegion(await readSelection(page));
  });
}

/**
 * @param {Page} page
 */
async function switchToRegionLevel(page) {
  await page.locator('input[type="radio"][name="level"][value="region"]').check();
  await settle(page);
}

/**
 * Selects with the mouse on purpose, so the keyboard flows under test do not depend on each other.
 * The pointer then rests outside the map, so only the keyboard focus can raise the unit.
 *
 * @param {Page} page
 */
async function selectSaoPauloAndRestPointer(page) {
  await clickUnit(page, SAO_PAULO_CODE);
  await page.mouse.move(5, 5);
  await settle(page);
}

/**
 * Presses Tab from the control right before the panel until the focus is inside the selector.
 *
 * @param {Page} page
 * @param {string} selector
 */
async function tabUntilFocusInside(page, selector) {
  await page.locator(TAB_ANCHOR).focus();
  for (let press = 0; press < MAX_TAB_PRESSES; press += 1) {
    await page.keyboard.press("Tab");
    if (await isFocusInside(page, selector)) {
      return;
    }
  }
  throw new Error(`Tab did not reach ${selector} within ${MAX_TAB_PRESSES} presses`);
}

/**
 * @param {Page} page
 * @param {string} selector
 * @returns {Promise<boolean>}
 */
async function isFocusInside(page, selector) {
  return page.evaluate((css) => Boolean(document.activeElement?.closest(css)), selector);
}

/**
 * @param {Page} page
 * @returns {Promise<string>}
 */
async function readFocusedTagName(page) {
  return page.evaluate(() => document.activeElement?.tagName ?? "");
}

/**
 * @param {Page} page
 * @returns {Promise<number>} the index of the ranking row holding the focus, -1 when none.
 */
async function readFocusedRowIndex(page) {
  return page.evaluate((css) => {
    const rows = Array.from(document.querySelectorAll(css));
    return rows.findIndex((row) => row.contains(document.activeElement));
  }, RANKING_ROW);
}

/**
 * Simulates the focus leaving the remove button for another part of the same row.
 * Tab cannot do it, because the remove button is the only control of its row.
 *
 * @param {Page} page
 */
async function dispatchFocusOutToSameRow(page) {
  await page.evaluate(
    ({ buttonSelector, siblingSelector }) => {
      const button = document.querySelector(buttonSelector);
      const sibling = button?.closest("tr")?.querySelector(siblingSelector);
      button?.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: sibling }));
    },
    { buttonSelector: REMOVE_BUTTON, siblingSelector: ROW_VALUE_CELL },
  );
}

/**
 * @param {string[]} selectedCodes
 */
function expectExactlyOneWholeRegion(selectedCodes) {
  const regionCodes = new Set(selectedCodes.map((code) => regionCodeByMunicipality.get(code)));
  expect(regionCodes.size).toBe(1);

  const [regionCode] = [...regionCodes];
  const regionSize = [...regionCodeByMunicipality.values()].filter(
    (code) => code === regionCode,
  ).length;
  expect(selectedCodes).toHaveLength(regionSize);
}

/**
 * @returns {Map<string, string>} municipality code to region code.
 */
function readRegionCodeByMunicipality() {
  const municipalities = parseMunicipalities(
    JSON.parse(fs.readFileSync("data/municipalities.json", "utf8")),
  );
  return new Map(
    municipalities.map((/** @type {{ code: string, regionCode: string }} */ m) => [
      m.code,
      m.regionCode,
    ]),
  );
}
