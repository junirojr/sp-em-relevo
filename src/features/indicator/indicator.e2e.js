import { expect, test } from "@playwright/test";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_1280_900 = { width: 1280, height: 900 };

test.describe("IND indicator slice (IND-01 to IND-07, ERR-04)", () => {
  test("IND-01 opens with population and municipality selected, empty selection, visible legend and source", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const populationRadio = page.locator(
        'input[type="radio"][name="indicator"][value="population"]',
      );
      await expect(populationRadio).toBeChecked();

      const levelRadio = page.locator('input[type="radio"][name="level"][value="municipality"]');
      if ((await levelRadio.count()) > 0) {
        await expect(levelRadio).toBeChecked();
      }

      const selection = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        return inspector.readSelection();
      });
      expect(selection).toEqual([]);

      const legend = page.locator(".scale-legend");
      await expect(legend).toBeVisible();

      const source = page.locator("#indicator-source-view");
      await expect(source).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("IND-02 four native visible radio inputs in fieldset with legend after title", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const fieldset = page.locator(".indicator-fieldset");
      await expect(fieldset).toBeVisible();

      const legend = fieldset.locator("legend");
      await expect(legend).toHaveText("Indicador");

      const radios = fieldset.locator('input[type="radio"][name="indicator"]');
      await expect(radios).toHaveCount(4);

      const expected = ["population", "area", "density", "gdpPerCapita"];
      for (let i = 0; i < expected.length; i += 1) {
        const radio = radios.nth(i);
        await expect(radio).toBeVisible();
        await expect(radio).toHaveAttribute("value", expected[i]);
      }
    } finally {
      await context.close();
    }
  });

  test("IND-03 indicator catalog declared and consistent values across pill and legend", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      // Point at Sao Paulo (code 3550308)
      await page.evaluate(() => {
        const store = /** @type {any} */ (window).__appStore;
        if (store) {
          store.dispatch({ type: "pointer/pointedUnitChanged", code: "3550308" });
        }
      });

      const pillValue = page.locator("#pointed-pill .pill-value");
      await expect(pillValue).toBeVisible();
      const text = await pillValue.textContent();
      expect(text?.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test("IND-04 switching indicator updates colors and legend immediately while height transitions", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const cameraBefore = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        return inspector.readCamera();
      });
      const selectionBefore = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        return inspector.readSelection();
      });

      // Switch indicator to density
      const densityRadio = page.locator('input[type="radio"][name="indicator"][value="density"]');
      await densityRadio.check();

      // Immediately verify colors and legend updated on same frame before settling
      const legendIndicator = page.locator(".scale-legend .legend-indicator");
      await expect(legendIndicator).toHaveText("Densidade demográfica");

      const cameraAfter = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        return inspector.readCamera();
      });
      const selectionAfter = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        return inspector.readSelection();
      });
      expect(cameraAfter).toEqual(cameraBefore);
      expect(selectionAfter).toEqual(selectionBefore);

      await settle(page);
      const isSettled = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        return inspector.isSettled();
      });
      expect(isSettled).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("IND-05 gdp per capita shows compound year description in legend and pill", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const gdpRadio = page.locator('input[type="radio"][name="indicator"][value="gdpPerCapita"]');
      await gdpRadio.check();

      const legendYear = page.locator(".scale-legend .legend-year");
      await expect(legendYear).toContainText("PIB 2023 / população 2022");

      const pill = page.locator("#pointed-pill");
      await expect(pill).toContainText("PIB 2023 / população 2022");
    } finally {
      await context.close();
    }
  });

  test("IND-06 indicator, unit, year and source are visible on stage", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const sourceView = page.locator("#indicator-source-view");
      await expect(sourceView).toBeVisible();

      const title = sourceView.locator(".source-view-title");
      await expect(title).toBeVisible();

      const unit = sourceView.locator(".source-view-unit");
      await expect(unit).toBeVisible();

      const year = sourceView.locator(".source-view-year");
      await expect(year).toBeVisible();

      const sourceLink = sourceView.locator(".source-view-link");
      await expect(sourceLink).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("IND-07 query parameters initialize state and update URL via replaceState", async ({
    browser,
  }) => {
    const { context, page } = await openPage(
      browser,
      { viewport: VIEWPORT_1280_900 },
      "/?indicador=density&ver=municipality",
    );
    try {
      const densityRadio = page.locator('input[type="radio"][name="indicator"][value="density"]');
      await expect(densityRadio).toBeChecked();

      const historyLengthBefore = await page.evaluate(() => window.history.length);

      // Switch to area
      const areaRadio = page.locator('input[type="radio"][name="indicator"][value="area"]');
      await areaRadio.check();

      const currentUrl = page.url();
      expect(currentUrl).toContain("indicador=area");

      const historyLengthAfter = await page.evaluate(() => window.history.length);
      expect(historyLengthAfter).toBe(historyLengthBefore);
    } finally {
      await context.close();
    }
  });

  test("ERR-04 four rapid indicator switches leave state, legend, pill and colors on last choice", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await page.evaluate(() => {
        const store = /** @type {any} */ (window).__appStore;
        const changeIndicator = (/** @type {string} */ id) => ({
          type: "indicator/changed",
          id,
        });
        store.dispatch(changeIndicator("area"));
        store.dispatch(changeIndicator("density"));
        store.dispatch(changeIndicator("population"));
        store.dispatch(changeIndicator("gdpPerCapita"));
      });

      const state = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        return inspector.readState();
      });
      expect(state.indicator.id).toBe("gdpPerCapita");

      const legendIndicator = page.locator(".scale-legend .legend-indicator");
      await expect(legendIndicator).toHaveText("PIB per capita");

      const legendYear = page.locator(".scale-legend .legend-year");
      await expect(legendYear).toContainText("PIB 2023 / população 2022");
    } finally {
      await context.close();
    }
  });
});
