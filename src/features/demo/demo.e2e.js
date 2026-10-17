import { expect, test } from "@playwright/test";
import { clickUnit, inspect, readCodes, readState } from "../../../tests/support/inspector.js";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_1280_900 = { width: 1280, height: 900 };
const SAO_PAULO_CODE = "3550308";
const CAMPINAS_CODE = "3509502";
const DEMO_LABEL = "Dado sintético";
const RETURN_LABEL = "Voltar ao dado real";
const REAL_SOURCE = "IBGE, Censo Demográfico";
const INDICATOR_IDS = ["population", "area", "density", "gdpPerCapita"];
// Math.random at 0.5 maps to the middle of 1..99999, so the Sortear click draws 50000.
const SORTEAR_RANDOM_FRACTION = 0.5;
const DRAW_AFTER_SORTEAR = 50000;

/** @typedef {import("@playwright/test").Page} Page */

/** @param {Page} page */
async function openSettings(page) {
  await page.locator("#settings-toggle").click();
  await expect(page.locator("#settings-toggle")).toHaveAttribute("aria-expanded", "true");
}

/** @param {Page} page */
async function turnDemoOnFromSettings(page) {
  await openSettings(page);
  await page.locator("#demo-active-toggle").check();
  await expect.poll(async () => (await readState(page)).demo.isActive).toBe(true);
  await settle(page);
}

/**
 * @param {Page} page
 * @param {number} drawNumber
 */
async function chooseDraw(page, drawNumber) {
  const input = page.locator("#demo-draw-number");
  await input.fill(String(drawNumber));
  await input.dispatchEvent("change");
  await expect.poll(async () => (await readState(page)).demo.drawNumber).toBe(drawNumber);
  await settle(page);
}

/** @param {Page} page */
async function readSyntheticVector(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readCodes().map((/** @type {string} */ code) => inspector.inspect(code).value);
  });
}

/** @param {Page} page */
async function readDataSource(page) {
  return page.evaluate(() => /** @type {any} */ (window).mapInspector.readDataSource());
}

/**
 * Makes the next random draw land on a known number, so the Sortear test does not depend on luck.
 *
 * @param {Page} page
 */
async function fixNextRandomDraw(page) {
  await page.evaluate((fraction) => {
    /** @type {any} */ (window).originalRandom = Math.random;
    Math.random = () => fraction;
  }, SORTEAR_RANDOM_FRACTION);
}

/** @param {Page} page */
async function restoreRandom(page) {
  await page.evaluate(() => {
    Math.random = /** @type {any} */ (window).originalRandom;
  });
}

/**
 * The state as the user last saw it, without the demo section.
 *
 * @param {any} state
 */
function withoutDemo(state) {
  return Object.fromEntries(Object.entries(state).filter(([key]) => key !== "demo"));
}

test.describe("DEM demo slice (DEM-01 to DEM-04)", () => {
  test("DEM-01 only the Settings control turns the demo on, with one summed indicator and the real ones disabled", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      expect((await readState(page)).demo.isActive).toBe(false);
      await expect(page.locator("#demo-stage-banner")).toBeHidden();
      await expect(page.locator("#indicator-container input[type='radio']")).toHaveCount(4);
      for (const id of INDICATOR_IDS) {
        await expect(page.locator(`input[name='indicator'][value='${id}']`)).toBeEnabled();
      }

      await openSettings(page);
      await expect(page.locator("#settings-panel #demo-active-toggle")).not.toBeChecked();
      await page.locator("#demo-active-toggle").check();
      await expect.poll(async () => (await readState(page)).demo.isActive).toBe(true);
      await settle(page);

      for (const id of INDICATOR_IDS) {
        const radio = page.locator(`input[name='indicator'][value='${id}']`);
        await expect(radio).toBeDisabled();
        await expect(radio).not.toBeChecked();
      }
      await expect(page.locator("#demo-indicator-notice")).toBeVisible();
      await expect(page.locator("#demo-indicator-notice")).not.toHaveText("");
      await expect(page.locator(".legend-indicator")).toContainText("Valor sintético");

      const legend = await page.evaluate(() =>
        /** @type {any} */ (window).mapInspector.readLegend(),
      );
      expect(legend.indicatorId).toBe("synthetic");

      await clickUnit(page, SAO_PAULO_CODE);
      await clickUnit(page, CAMPINAS_CODE);
      const saoPaulo = await inspect(page, SAO_PAULO_CODE);
      const campinas = await inspect(page, CAMPINAS_CODE);
      await expect(page.locator(".selection-total-label")).toHaveText("Total");
      const expectedTotal = (saoPaulo.value + campinas.value).toLocaleString("pt-BR");
      await expect(page.locator(".selection-total-value")).toHaveText(expectedTotal);
    } finally {
      await context.close();
    }
  });

  test("DEM-02 the synthetic data is named on the banner, legend, pill, readDataSource and inspect", async ({
    browser,
  }) => {
    const { context, page, consoleProblems } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
    });
    try {
      expect(await readDataSource(page)).toBe(REAL_SOURCE);
      expect((await inspect(page, SAO_PAULO_CODE)).source).toBe(REAL_SOURCE);
      await expect(page.locator("#demo-stage-banner")).toBeHidden();

      await turnDemoOnFromSettings(page);

      const banner = page.locator("#demo-stage-banner");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(DEMO_LABEL);
      await expect(banner.getByRole("button", { name: RETURN_LABEL })).toBeVisible();
      await expect(page.locator(".legend-indicator")).toContainText(DEMO_LABEL);
      await expect(page.locator("#pointed-pill .pill-year")).toHaveText(DEMO_LABEL);
      expect(await readDataSource(page)).toBe(DEMO_LABEL);
      expect((await inspect(page, SAO_PAULO_CODE)).source).toBe(DEMO_LABEL);
      expect(consoleProblems).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("DEM-03 the same draw number gives the same vector, in this page and in a new one", async ({
    browser,
  }) => {
    const first = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    const second = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      expect((await readCodes(first.page)).length).toBe(645);
      await turnDemoOnFromSettings(first.page);
      await chooseDraw(first.page, 1);
      const draw1 = await readSyntheticVector(first.page);
      await chooseDraw(first.page, 99999);
      const draw99999 = await readSyntheticVector(first.page);
      await chooseDraw(first.page, 1);
      const draw1Again = await readSyntheticVector(first.page);

      expect(draw1Again).toEqual(draw1);
      expect(draw99999).not.toEqual(draw1);
      expect(draw1.some((/** @type {number} */ value) => value > 0)).toBe(true);

      await turnDemoOnFromSettings(second.page);
      await chooseDraw(second.page, 1);
      expect(await readSyntheticVector(second.page)).toEqual(draw1);
    } finally {
      await first.context.close();
      await second.context.close();
    }
  });

  test("DEM-04 turning the demo off, by the banner or by Settings, brings back the real data and indicator and keeps the selection and level; reload opens on IBGE data", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await page.locator("input[name='indicator'][value='area']").check();
      await settle(page);
      await clickUnit(page, SAO_PAULO_CODE);
      // The pointer leaves the map to reach the controls, so start with it off the map.
      await page.mouse.move(20, 20);
      await expect.poll(async () => (await readState(page)).pointer.pointedCode).toBeNull();
      const before = await readState(page);
      expect(before.selection.selectedCodes).toContain(SAO_PAULO_CODE);
      expect(before.indicator.id).toBe("area");

      await turnDemoOnFromSettings(page);
      expect(page.url()).not.toContain("demo");
      await page.locator('input[type="radio"][name="level"][value="region"]').check();
      await settle(page);
      const searchInput = page.locator("#city-search");
      await searchInput.fill("RA Campinas");
      await searchInput.press("Enter");
      await searchInput.blur();
      await settle(page);
      expect(page.url()).not.toContain("demo");
      const duringBannerDemo = withoutDemo(await readState(page));
      expect(duringBannerDemo.level.id).toBe("region");
      expect(duringBannerDemo.selection.selectedCodes).toContain(CAMPINAS_CODE);
      expect(duringBannerDemo.selection.selectedCodes).toContain(SAO_PAULO_CODE);

      // Leaving changes nothing but the demo: the real indicator was frozen while it was on
      await page.getByRole("button", { name: RETURN_LABEL }).click();
      await expect.poll(async () => (await readState(page)).demo.isActive).toBe(false);
      await settle(page);
      expect(withoutDemo(await readState(page))).toEqual(duringBannerDemo);
      expect((await readState(page)).indicator.id).toBe("area");
      await expect(page.locator("#demo-stage-banner")).toBeHidden();
      await expect(page.locator("#demo-indicator-notice")).toBeHidden();
      await expect(page.locator("input[name='indicator'][value='area']")).toBeEnabled();
      await expect(page.locator("input[name='indicator'][value='area']")).toBeChecked();
      expect(await readDataSource(page)).toBe(REAL_SOURCE);

      await page.locator("#demo-active-toggle").check();
      await expect.poll(async () => (await readState(page)).demo.isActive).toBe(true);
      await page.locator('input[type="radio"][name="level"][value="municipality"]').check();
      await settle(page);
      const duringSettingsDemo = withoutDemo(await readState(page));
      await page.locator("#demo-active-toggle").uncheck();
      await expect.poll(async () => (await readState(page)).demo.isActive).toBe(false);
      await settle(page);
      const afterSettings = withoutDemo(await readState(page));
      expect(afterSettings).toEqual(duringSettingsDemo);
      expect(afterSettings.level.id).toBe("municipality");
      expect(afterSettings.indicator.id).toBe("area");

      await page.locator("#demo-active-toggle").check();
      await expect.poll(async () => (await readState(page)).demo.isActive).toBe(true);
      await page.reload();
      await settle(page);
      expect((await readState(page)).demo.isActive).toBe(false);
      expect(await readDataSource(page)).toBe(REAL_SOURCE);
      await expect(page.locator("#demo-stage-banner")).toBeHidden();

      await page.goto("/?demo=1");
      await settle(page);
      expect((await readState(page)).demo.isActive).toBe(false);
      expect(await readDataSource(page)).toBe(REAL_SOURCE);
    } finally {
      await context.close();
    }
  });

  test("DEM-03 the Sortear button changes the draw number and the data", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await turnDemoOnFromSettings(page);
      const vectorBefore = await readSyntheticVector(page);

      await fixNextRandomDraw(page);
      await page.locator("#demo-draw-button").click();
      await restoreRandom(page);
      await expect
        .poll(async () => (await readState(page)).demo.drawNumber)
        .toBe(DRAW_AFTER_SORTEAR);
      await expect(page.locator("#demo-draw-number")).toHaveValue(String(DRAW_AFTER_SORTEAR));
      await settle(page);

      expect(await readSyntheticVector(page)).not.toEqual(vectorBefore);
    } finally {
      await context.close();
    }
  });
});
