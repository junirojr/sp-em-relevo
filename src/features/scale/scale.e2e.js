import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { inspect } from "../../../tests/support/inspector.js";
import { oklab } from "../../../tests/support/oklab.js";
import { openPage, settle } from "../../../tests/support/page.js";
import { parseMunicipalities } from "../../app/data-loader.js";
import { classify } from "../../domain/classification.js";

const VIEWPORT_1280_900 = { width: 1280, height: 900 };

const municipalitiesData = parseMunicipalities(
  JSON.parse(fs.readFileSync("data/municipalities.json", "utf8")),
);

/**
 * @param {import("@playwright/test").Page} page
 */
async function readLegend(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readLegend();
  });
}

test.describe("ESC scale slice (ESC-05, ESC-07 to ESC-09)", () => {
  test("ESC-05 shared class function between legend and scene across 20 municipalities and non-overlapping label boxes", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const legend = await readLegend(page);
      expect(legend).toBeDefined();
      expect(legend.breaks).toHaveLength(6);
      expect(legend.colors).toHaveLength(7);

      // Select 20 varied municipalities spread across the state
      const step = Math.floor(municipalitiesData.length / 20);
      const sampledCodes = [];
      for (let i = 0; i < 20; i += 1) {
        sampledCodes.push(municipalitiesData[i * step].code);
      }

      for (let i = 0; i < sampledCodes.length; i += 1) {
        const code = sampledCodes[i];
        const ins = await inspect(page, code);
        expect(ins).not.toBeNull();

        const expectedClass = classify(ins.value, legend.breaks);
        expect(ins.classIndex).toBe(expectedClass);
        expect(ins.color).toBe(legend.colors[expectedClass]);
      }

      // Verify label bounding boxes do not overlap
      const labels = page.locator(".scale-legend .legend-bands .band-label");
      await expect(labels).toHaveCount(7);

      const boxes = [];
      for (let i = 0; i < 7; i += 1) {
        const box = await labels.nth(i).boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          boxes.push(box);
        }
      }

      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const b1 = boxes[i];
          const b2 = boxes[j];
          const overlapsY = b1.y < b2.y + b2.height && b1.y + b1.height > b2.y;
          const overlapsX = b1.x < b2.x + b2.width && b1.x + b1.width > b2.x;
          const overlaps = overlapsX && overlapsY;
          expect(overlaps).toBe(false);
        }
      }
    } finally {
      await context.close();
    }
  });

  test("ESC-07 HTML legend displays indicator, level, unit, year and source, hiding missing data notice when complete", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const legend = page.locator(".scale-legend");
      await expect(legend).toBeVisible();

      const indicator = legend.locator(".legend-indicator");
      await expect(indicator).toHaveText("População");

      const level = legend.locator(".legend-level");
      await expect(level).toContainText("Município");

      const unit = legend.locator(".legend-unit");
      await expect(unit).toHaveText("habitantes");

      const year = legend.locator(".legend-year");
      await expect(year).toHaveText("Censo 2022");

      const source = legend.locator(".legend-source");
      await expect(source).toContainText("IBGE");

      const missing = legend.locator(".legend-missing");
      await expect(missing).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test("ESC-08 in both light and dark themes, band colors have strictly decreasing OKLab lightness", async ({
    browser,
  }) => {
    // Light theme
    const { context: lightCtx, page: lightPage } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
    });
    try {
      const lightLegend = await readLegend(lightPage);
      expect(lightLegend.colors).toHaveLength(7);

      const lightLightness = lightLegend.colors.map((/** @type {any} */ c) => oklab(c).L);
      for (let i = 1; i < lightLightness.length; i += 1) {
        expect(lightLightness[i - 1]).toBeGreaterThan(lightLightness[i]);
      }
    } finally {
      await lightCtx.close();
    }

    // Dark theme
    const { context: darkCtx, page: darkPage } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
      colorScheme: "dark",
    });
    try {
      const darkLegend = await readLegend(darkPage);
      expect(darkLegend.colors).toHaveLength(7);

      const darkLightness = darkLegend.colors.map((/** @type {any} */ c) => oklab(c).L);
      for (let i = 1; i < darkLightness.length; i += 1) {
        expect(darkLightness[i - 1]).toBeGreaterThan(darkLightness[i]);
      }
    } finally {
      await darkCtx.close();
    }
  });

  test("ESC-09 page contains collapsed 'Como ler este mapa' details with scale, height, and aggregation lines", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const details = page.locator("details.how-to-read-details");
      await expect(details).toBeVisible();
      await expect(details).not.toHaveAttribute("open", "");

      const summary = details.locator("summary.how-to-read-summary");
      await expect(summary).toHaveText("Como ler este mapa");

      // Expand details
      await summary.click();
      await expect(details).toHaveAttribute("open", "");

      const lines = details.locator("li.how-to-read-line");
      await expect(lines).toHaveCount(3);

      const firstLine = await lines.nth(0).textContent();
      const secondLine = await lines.nth(1).textContent();
      const thirdLine = await lines.nth(2).textContent();

      expect(firstLine).toContain("Escala:");
      expect(secondLine).toContain("Altura:");
      expect(thirdLine).toContain("Agregação:");

      // Verify absence of forbidden dashes
      expect(firstLine?.includes("\u2013")).toBe(false);
      expect(firstLine?.includes("\u2014")).toBe(false);
      expect(secondLine?.includes("\u2013")).toBe(false);
      expect(secondLine?.includes("\u2014")).toBe(false);
      expect(thirdLine?.includes("\u2013")).toBe(false);
      expect(thirdLine?.includes("\u2014")).toBe(false);
    } finally {
      await context.close();
    }
  });

  test("ESC-07 with missing indicator values, legend displays missing notice and missing municipality is painted neutral color", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: VIEWPORT_1280_900 });
    const page = await context.newPage();
    try {
      await page.route("**/data/municipalities.json", async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        const municipalities = parseMunicipalities(json);
        const target = municipalities.find(
          (/** @type {{ code: string }} */ m) => m.code === "3550308",
        );
        if (target) {
          /** @type {{population: number | null}} */ (target).population = null;
        }
        await route.fulfill({ json: { ...json, municipalities } });
      });

      await page.goto("/?uf=35");
      await settle(page);

      const legend = page.locator(".scale-legend");
      const missing = legend.locator(".legend-missing");
      await expect(missing).toBeVisible();

      const legendState = await readLegend(page);
      expect(legendState.hasMissing).toBe(true);

      const ins = await inspect(page, "3550308");
      expect(ins.value).toBeNull();
      expect(ins.classIndex).toBe(255);

      const palette = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        return inspector.readMapPalette();
      });
      expect(ins.color.toLowerCase()).toBe(palette.neutral.toLowerCase());

      const areaRadio = page.locator('input[type="radio"][name="indicator"][value="area"]');
      await areaRadio.check();
      await settle(page);

      await expect(missing).toBeHidden();
      const updatedLegend = await readLegend(page);
      expect(updatedLegend.hasMissing).toBe(false);
    } finally {
      await context.close();
    }
  });

  test("REG-01 and REG-02 in region color mode the legend displays 16 administrative regions with low chroma colors", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const regionRadio = page.locator("#appearance-color-region");
      await regionRadio.check();
      await settle(page);

      const colorDesc = page.locator(".scale-legend .legend-rows dd").nth(1);
      await expect(colorDesc).toBeVisible();

      await page.locator("summary.how-to-read-summary").click();
      const howToReadLine = page.locator(".how-to-read-line.line-scale");
      await expect(howToReadLine).toBeVisible();

      // Verify no forbidden dashes in scale line
      const scaleText = await howToReadLine.textContent();
      expect(scaleText?.includes("\u2013")).toBe(false);
      expect(scaleText?.includes("\u2014")).toBe(false);
    } finally {
      await context.close();
    }
  });
});
