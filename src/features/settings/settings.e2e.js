import { expect, test } from "@playwright/test";
import {
  clickUnit,
  inspect,
  readCamera,
  readEngineStats,
  readSelection,
  readState,
} from "../../../tests/support/inspector.js";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_1280_900 = { width: 1280, height: 900 };
const SAO_PAULO_CODE = "3550308";
const SELECTION_BLUE = "#2f4bff";

/** @typedef {import("@playwright/test").Page} Page */

/** @param {Page} page */
async function openSettings(page) {
  await page.locator("#settings-toggle").click();
  await expect(page.locator("#settings-toggle")).toHaveAttribute("aria-expanded", "true");
}

/** @param {Page} page */
async function readDrawCalls(page) {
  const stats = await readEngineStats(page);
  return stats.drawCalls;
}

test.describe("CFG settings slice (CFG-01 to CFG-07)", () => {
  test("CFG-01 settings start collapsed at the foot of the scrollable column, above the footer", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const toggle = page.locator("#settings-toggle");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#settings-panel")).toBeHidden();

      const isInsideScrollArea = await page.evaluate(() => {
        const toggleElement = document.getElementById("settings-toggle");
        const content = document.querySelector("#sidebar .sidebar-content");
        const container = document.getElementById("settings-container");
        if (!toggleElement || !content || !container) {
          return false;
        }
        return content.contains(toggleElement) && content.lastElementChild === container;
      });
      expect(isInsideScrollArea).toBe(true);

      const isBeforeFooter = await page.evaluate(() => {
        const toggleElement = document.getElementById("settings-toggle");
        const footer = document.getElementById("app-footer");
        if (!toggleElement || !footer) {
          return false;
        }
        return Boolean(
          toggleElement.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      });
      expect(isBeforeFooter).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("CFG-02 Esc closes the open settings, returns focus to the button and keeps the selection", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await clickUnit(page, SAO_PAULO_CODE);
      const selectionBefore = await readSelection(page);
      expect(selectionBefore).toContain(SAO_PAULO_CODE);

      await openSettings(page);
      await page.locator("#toggle-shadow").focus();
      await page.keyboard.press("Escape");

      await expect(page.locator("#settings-toggle")).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#settings-panel")).toBeHidden();
      await expect(page.locator("#settings-toggle")).toBeFocused();
      expect(await readSelection(page)).toEqual(selectionBefore);
    } finally {
      await context.close();
    }
  });

  test("CFG-03 draw calls are 4 with shadow and borders, 2 without shadow, 1 without both", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await openSettings(page);
      expect((await readState(page)).level.id).toBe("municipality");
      await expect.poll(() => readDrawCalls(page)).toBe(4);

      await page.locator("#toggle-shadow").uncheck();
      await settle(page);
      await expect.poll(() => readDrawCalls(page)).toBe(2);

      await page.locator("#toggle-borders").uncheck();
      await settle(page);
      await expect.poll(() => readDrawCalls(page)).toBe(1);
    } finally {
      await context.close();
    }
  });

  test("CFG-04 view angle, tilt, framing, simulated reduced motion and measurements", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await openSettings(page);
      const angle = page.locator("#view-angle");
      await expect(angle).toHaveAttribute("min", "5");
      await expect(angle).toHaveAttribute("max", "60");
      await expect(angle).toHaveValue("30");
      expect((await readCamera(page)).viewAngleDegrees).toBe(30);

      await angle.fill("45");
      await settle(page);
      expect((await readCamera(page)).viewAngleDegrees).toBe(45);
      await expect(page.locator("label[for='view-angle'] output")).toHaveText("45°");

      await page.locator("#toggle-tilt").uncheck();
      await page.locator("#toggle-fly").uncheck();
      await page.locator("#toggle-motion").check();
      const settings = (await readState(page)).settings;
      expect(settings.viewAngleDegrees).toBe(45);
      expect(settings.isTiltOn).toBe(false);
      expect(settings.isFramingOn).toBe(false);
      expect(settings.isMotionReduced).toBe(true);

      const rows = page.locator(".settings-stats dd");
      await expect(rows).toHaveCount(5);
      await expect.poll(() => rows.allTextContents()).not.toContain("…");
    } finally {
      await context.close();
    }
  });

  test("CFG-04 the media preference for reduced motion is mirrored by the simulation option", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
      reducedMotion: "reduce",
    });
    try {
      await openSettings(page);
      await expect(page.locator("#toggle-motion")).toBeChecked();
      expect((await readState(page)).settings.isMotionReduced).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("CFG-05 flat height, exaggeration range and color mode drive the engine", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const scale = page.locator("#appearance-exaggeration");
      await expect(scale).toHaveAttribute("min", "0.4");
      await expect(scale).toHaveAttribute("max", "2");
      await expect(scale).toHaveAttribute("step", "0.1");
      await expect(scale).toHaveValue("0.5");
      await expect(scale).toBeEnabled();

      const asDataHeight = (await inspect(page, SAO_PAULO_CODE)).heightTarget;
      expect(asDataHeight).toBeGreaterThan(1);

      await scale.fill("2");
      await settle(page);
      const exaggeratedHeight = (await inspect(page, SAO_PAULO_CODE)).heightTarget;
      expect(exaggeratedHeight).toBeGreaterThan(asDataHeight);

      await page.locator("#appearance-height-flat").check();
      await settle(page);
      await expect(scale).toBeDisabled();
      expect((await inspect(page, SAO_PAULO_CODE)).heightTarget).toBe(1);

      await page.locator("#appearance-height-data").check();
      await settle(page);
      await expect(scale).toBeEnabled();
      expect((await inspect(page, SAO_PAULO_CODE)).heightTarget).toBe(exaggeratedHeight);

      const heatClass = (await inspect(page, SAO_PAULO_CODE)).classIndex;
      expect(heatClass).toBeGreaterThan(0);
      await page.locator("#appearance-color-selection").check();
      await settle(page);
      expect((await readState(page)).settings.colorMode).toBe("selection");
      expect((await inspect(page, SAO_PAULO_CODE)).classIndex).toBe(0);

      await clickUnit(page, SAO_PAULO_CODE);
      const selected = await inspect(page, SAO_PAULO_CODE);
      expect(selected.isSelected).toBe(true);
      expect(selected.color).toBe(SELECTION_BLUE);
    } finally {
      await context.close();
    }
  });

  test("CFG-06 controls are born from the initial state, autocomplete off, and reload restores defaults", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await openSettings(page);
      await page.locator("#appearance-height-flat").check();
      await page.locator("#appearance-color-selection").check();
      await page.locator("#view-angle").fill("50");
      await page.locator("#toggle-tilt").uncheck();
      await page.locator("#toggle-fly").uncheck();
      await page.locator("#toggle-shadow").uncheck();
      await page.locator("#toggle-borders").uncheck();
      await page.locator("#toggle-motion").check();

      await page.reload();
      await settle(page);
      await openSettings(page);

      const autocompleteValues = await page.$$eval(
        "#settings-panel .settings-card input",
        (inputs) => inputs.map((input) => input.getAttribute("autocomplete")),
      );
      expect(autocompleteValues.length).toBe(6);
      expect(autocompleteValues.every((value) => value === "off")).toBe(true);

      await expect(page.locator("#appearance-height-data")).toBeChecked();
      await expect(page.locator("#appearance-color-heat")).toBeChecked();
      await expect(page.locator("#appearance-exaggeration")).toHaveValue("0.5");
      await expect(page.locator("#view-angle")).toHaveValue("30");
      await expect(page.locator("#toggle-tilt")).toBeChecked();
      await expect(page.locator("#toggle-fly")).toBeChecked();
      await expect(page.locator("#toggle-shadow")).toBeChecked();
      await expect(page.locator("#toggle-borders")).toBeChecked();
      await expect(page.locator("#toggle-motion")).not.toBeChecked();

      expect((await readState(page)).settings).toEqual({
        heightMode: "data",
        exaggeration: 0.5,
        colorMode: "heat",
        isFramingOn: true,
        isTiltOn: true,
        viewAngleDegrees: 30,
        isShadowOn: true,
        areBordersOn: true,
        isMotionReduced: false,
      });
    } finally {
      await context.close();
    }
  });

  test("CFG-07 nothing is stored in web storage, cookies or IndexedDB", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await openSettings(page);
      await page.locator("#appearance-height-flat").check();
      await page.locator("#view-angle").fill("20");
      await page.locator("#toggle-shadow").uncheck();
      await page.locator("#appearance-color-selection").check();
      await clickUnit(page, SAO_PAULO_CODE);

      const storage = await page.evaluate(async () => ({
        local: window.localStorage.length,
        session: window.sessionStorage.length,
        cookie: document.cookie,
        databases: (await window.indexedDB.databases()).length,
      }));
      expect(storage).toEqual({ local: 0, session: 0, cookie: "", databases: 0 });
    } finally {
      await context.close();
    }
  });
});
