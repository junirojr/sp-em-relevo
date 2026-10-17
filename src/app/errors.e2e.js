import { expect, test } from "@playwright/test";
import { inspect, readFrameCount } from "../../tests/support/inspector.js";
import { openPage, settle } from "../../tests/support/page.js";
import { DATA_FILES } from "./data-loader.js";

const DEFAULT_VIEWPORT = { width: 1280, height: 900 };

test.describe("ERR-01 data loading delays", () => {
  for (const file of DATA_FILES) {
    test(`ERR-01 delay 2s on ${file} shows role="status" and resolves cleanly`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
      const page = await context.newPage();
      try {
        await page.route(`**/${file}`, async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await route.continue();
        });

        const gotoPromise = page.goto("/");

        // Status must be visible and have role="status" while loading
        const statusElement = page.locator("#stage-status");
        await expect(statusElement).toBeVisible({ timeout: 1500 });
        const role = await statusElement.getAttribute("role");
        expect(role).toBe("status");

        // The files load one after another, so the text names the delayed file only in its turn
        await expect(statusElement).toContainText(file, { timeout: 1500 });

        await gotoPromise;
        await settle(page);

        // After settle, stage-status is cleared/hidden and canvas renders
        await expect(statusElement).toBeHidden();
        const frameCount = await readFrameCount(page);
        expect(frameCount).toBeGreaterThan(0);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe("ERR-02 data loading failures (9 scenarios)", () => {
  const failureScenarios = [
    {
      name: "404 not found",
      /** @param {import("@playwright/test").Route} route */
      handler: (route) => route.fulfill({ status: 404, body: "Not found" }),
    },
    {
      name: "corrupted JSON",
      /** @param {import("@playwright/test").Route} route */
      handler: (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{ invalid json syntax: ",
        }),
    },
    {
      name: "truncated JSON",
      /** @param {import("@playwright/test").Route} route */
      handler: (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"municipalities": [',
        }),
    },
  ];

  for (const file of DATA_FILES) {
    for (const scenario of failureScenarios) {
      test(`ERR-02 ${scenario.name} on ${file} shows role="alert" with filename and reload action`, async ({
        browser,
      }) => {
        const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
        const page = await context.newPage();
        /** @type {string[]} */
        const pageErrors = [];

        page.on("pageerror", (err) => {
          pageErrors.push(err.message);
        });

        try {
          await page.route(`**/${file}`, async (route) => {
            await scenario.handler(route);
          });

          await page.goto("/");

          const statusElement = page.locator("#stage-status");
          await expect(statusElement).toHaveAttribute("role", "alert", { timeout: 10000 });

          const text = await statusElement.textContent();
          expect(text).toContain(file);
          expect(text).toContain("Recarregue a página");

          // Must have 0 pageerror
          expect(pageErrors).toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  }
});

test.describe("ERR-03 WebGL absence and context loss/restore", () => {
  test("ERR-03 getContext returning null displays missing WebGL message and keeps sidebar controls", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
    const page = await context.newPage();
    try {
      await page.addInitScript(() => {
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        // @ts-expect-error browser test override of prototype.getContext
        HTMLCanvasElement.prototype.getContext = function (
          /** @type {string} */ type,
          /** @type {any[]} */ ...args
        ) {
          if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") {
            return null;
          }
          // @ts-expect-error forwarding arguments to getContext
          return originalGetContext.apply(this, [type, ...args]);
        };
      });

      await page.goto("/");

      const statusElement = page.locator("#stage-status");
      await expect(statusElement).toHaveAttribute("role", "alert", { timeout: 10000 });
      const text = await statusElement.textContent();
      expect(text?.toLowerCase()).toContain("webgl");

      // Column controls remain visible and labeled
      const indicatorFieldset = page.locator(".indicator-fieldset");
      await expect(indicatorFieldset).toBeVisible();
      const legendText = await page.textContent(".indicator-legend");
      expect(legendText).toContain("Indicador");
    } finally {
      await context.close();
    }
  });

  test("ERR-03 loseContext followed by restoreContext resumes rendering and preserves settled state and colors", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser);
    try {
      const frameCount1 = await readFrameCount(page);
      const spCode = "3550308";
      const beforeInspection = await inspect(page, spCode);
      expect(beforeInspection.color).toBeTruthy();

      // Trigger context loss
      await page.evaluate(() => {
        const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("map-canvas"));
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        const loseExt = gl?.getExtension("WEBGL_lose_context");
        if (loseExt) {
          loseExt.loseContext();
        }
      });

      await page.waitForTimeout(200);

      // Trigger context restore
      await page.evaluate(() => {
        const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("map-canvas"));
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        const loseExt = gl?.getExtension("WEBGL_lose_context");
        if (loseExt) {
          loseExt.restoreContext();
        }
      });

      await settle(page);

      const frameCount2 = await readFrameCount(page);
      expect(frameCount2).toBeGreaterThanOrEqual(frameCount1);

      const afterInspection = await inspect(page, spCode);
      expect(afterInspection.color).toBe(beforeInspection.color);
    } finally {
      await context.close();
    }
  });

  test("ERR-04 rapid indicator events leave state settled and consistent", async ({ browser }) => {
    const { context, page } = await openPage(browser);
    try {
      const radio = page.locator('input[name="indicator"][value="population"]');
      await expect(radio).toBeVisible();

      await Promise.all([
        radio.dispatchEvent("change"),
        radio.dispatchEvent("change"),
        radio.dispatchEvent("change"),
        radio.dispatchEvent("change"),
      ]);

      await settle(page);

      const stats = await readFrameCount(page);
      expect(stats).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
