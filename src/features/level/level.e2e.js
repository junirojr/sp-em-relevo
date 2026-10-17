import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  inspect,
  readCamera,
  readLimits,
  readSelection,
} from "../../../tests/support/inspector.js";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_1280_900 = { width: 1280, height: 900 };

const municipalitiesData = JSON.parse(
  fs.readFileSync("data/municipalities.json", "utf8"),
).municipalities;
const regionsData = JSON.parse(fs.readFileSync("data/regions.json", "utf8")).regions;

test.describe("NIV level slice (NIV-01, NIV-06 to NIV-08)", () => {
  test("NIV-01 'Ver por' fieldset has two native radio inputs: Município and Região administrativa", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const fieldset = page.locator(".level-fieldset");
      await expect(fieldset).toBeVisible();

      const legend = fieldset.locator("legend");
      await expect(legend).toHaveText("Ver por");

      const radios = fieldset.locator('input[type="radio"][name="level"]');
      await expect(radios).toHaveCount(2);

      const municipalityRadio = fieldset.locator(
        'input[type="radio"][name="level"][value="municipality"]',
      );
      await expect(municipalityRadio).toBeVisible();
      await expect(municipalityRadio).toBeChecked();

      const regionRadio = fieldset.locator('input[type="radio"][name="level"][value="region"]');
      await expect(regionRadio).toBeVisible();
      await expect(regionRadio).not.toBeChecked();

      const choices = fieldset.locator(".level-choice");
      await expect(choices.nth(0)).toContainText("Município");
      await expect(choices.nth(1)).toContainText("Região administrativa");
    } finally {
      await context.close();
    }
  });

  test("NIV-06 in region level, two municipalities of each of the 16 regions have the same color and target height", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const regionRadio = page.locator('input[type="radio"][name="level"][value="region"]');
      await regionRadio.check();
      await settle(page);

      for (let r = 0; r < regionsData.length; r += 1) {
        const region = regionsData[r];
        const inRegion = municipalitiesData.filter(
          (/** @type {any} */ m) => m.regionCode === region.code,
        );
        expect(inRegion.length).toBeGreaterThanOrEqual(2);

        const firstCode = inRegion[0].code;
        const secondCode = inRegion[1].code;

        const firstInspection = await inspect(page, firstCode);
        const secondInspection = await inspect(page, secondCode);

        expect(firstInspection).not.toBeNull();
        expect(secondInspection).not.toBeNull();

        expect(firstInspection.color).toBe(secondInspection.color);
        expect(firstInspection.heightTarget).toBe(secondInspection.heightTarget);
      }
    } finally {
      await context.close();
    }
  });

  test("NIV-07 region limits are visible with 0.3 border opacity in region level and hidden in municipality level", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const initialLimits = await readLimits(page);
      expect(initialLimits.visible).toBe(false);
      expect(initialLimits.borderOpacity).toBe(1);
      expect(initialLimits.arcCount).toBe(321);

      const regionRadio = page.locator('input[type="radio"][name="level"][value="region"]');
      await regionRadio.check();

      const regionLimits = await readLimits(page);
      expect(regionLimits.visible).toBe(true);
      expect(regionLimits.borderOpacity).toBe(0.3);
      expect(regionLimits.arcCount).toBe(321);

      const municipalityRadio = page.locator(
        'input[type="radio"][name="level"][value="municipality"]',
      );
      await municipalityRadio.check();

      const backLimits = await readLimits(page);
      expect(backLimits.visible).toBe(false);
      expect(backLimits.borderOpacity).toBe(1);
      expect(backLimits.arcCount).toBe(321);
    } finally {
      await context.close();
    }
  });

  test("NIV-07 region limits lie inside the box of the map, not shifted off the state", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const regionRadio = page.locator('input[type="radio"][name="level"][value="region"]');
      await regionRadio.check();

      const bounds = await page.evaluate(() =>
        /** @type {any} */ (window).mapInspector.readLimitBounds(),
      );
      expect(bounds.limits).not.toBeNull();
      expect(bounds.map).not.toBeNull();

      // Interior limits never reach past the outline of the state
      const tolerance = 0.5;
      expect(bounds.limits.minX).toBeGreaterThanOrEqual(bounds.map.minX - tolerance);
      expect(bounds.limits.minY).toBeGreaterThanOrEqual(bounds.map.minY - tolerance);
      expect(bounds.limits.maxX).toBeLessThanOrEqual(bounds.map.maxX + tolerance);
      expect(bounds.limits.maxY).toBeLessThanOrEqual(bounds.map.maxY + tolerance);
    } finally {
      await context.close();
    }
  });

  test("NIV-08 switching level preserves readSelection and readCamera", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const cameraBefore = await readCamera(page);
      const selectionBefore = await readSelection(page);

      const regionRadio = page.locator('input[type="radio"][name="level"][value="region"]');
      await regionRadio.check();

      const cameraRegion = await readCamera(page);
      const selectionRegion = await readSelection(page);

      expect(cameraRegion).toEqual(cameraBefore);
      expect(selectionRegion).toEqual(selectionBefore);

      const municipalityRadio = page.locator(
        'input[type="radio"][name="level"][value="municipality"]',
      );
      await municipalityRadio.check();

      const cameraBack = await readCamera(page);
      const selectionBack = await readSelection(page);

      expect(cameraBack).toEqual(cameraBefore);
      expect(selectionBack).toEqual(selectionBefore);
    } finally {
      await context.close();
    }
  });
});
