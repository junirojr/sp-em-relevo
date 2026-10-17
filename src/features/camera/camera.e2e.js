import { expect, test } from "@playwright/test";
import { clickUnit, readCamera, readSelection } from "../../../tests/support/inspector.js";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_1280_900 = { width: 1280, height: 900 };

test.describe("CAM camera slice (CAM-01 to CAM-07)", () => {
  test("CAM-01 selection frames: single city >= 2, multiple covers box, empty resets to 1 and (0,0)", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const initialCamera = await readCamera(page);
      expect(initialCamera.zoom).toBe(1);
      expect(initialCamera.panX).toBe(0);
      expect(initialCamera.panY).toBe(0);

      // Single municipality frames with zoom >= 2 centered
      const spCode = "3550308";
      await clickUnit(page, spCode);
      await settle(page);

      const spCamera = await readCamera(page);
      expect(spCamera.zoomTarget).toBeGreaterThanOrEqual(2);

      // Multiple municipalities covers bounding box with zoom > 1
      const campinasCode = "3509502";
      await clickUnit(page, campinasCode);
      await settle(page);

      const groupCamera = await readCamera(page);
      expect(groupCamera.zoomTarget).toBeGreaterThan(1);

      // Empty selection resets to zoom 1 and pan (0,0)
      await page.evaluate(() => {
        const btn = /** @type {HTMLButtonElement | null} */ (
          document.getElementById("clear-selection")
        );
        if (btn) {
          btn.click();
        }
      });
      await settle(page);

      const resetCamera = await readCamera(page);
      expect(resetCamera.zoomTarget).toBe(1);
      expect(resetCamera.panX).toBe(0);
      expect(resetCamera.panY).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("CAM-02 with framing off, selection does not change camera; Clear resets camera; re-enabling frames selection", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      // Disable framing via store action
      await page.evaluate(() => {
        const store = /** @type {any} */ (window).__appStore;
        if (store) {
          store.dispatch({ type: "settings/changed", name: "isFramingOn", value: false });
        }
      });
      await settle(page);

      const cameraBefore = await readCamera(page);

      // Click unit: camera does not change
      const spCode = "3550308";
      await clickUnit(page, spCode);
      await settle(page);

      const cameraAfter = await readCamera(page);
      expect(cameraAfter).toEqual(cameraBefore);

      // Clear button always resets camera (P38)
      await page.evaluate(() => {
        const btn = /** @type {HTMLButtonElement | null} */ (
          document.getElementById("clear-selection")
        );
        if (btn) {
          btn.click();
        }
      });
      await settle(page);

      const cameraCleared = await readCamera(page);
      expect(cameraCleared.zoomTarget).toBe(1);
      expect(cameraCleared.panX).toBe(0);
      expect(cameraCleared.panY).toBe(0);

      // Select again with framing disabled
      await clickUnit(page, spCode);
      await settle(page);
      expect(await readCamera(page)).toEqual(cameraBefore);

      // Re-enable framing with active selection: frames immediately
      await page.evaluate(() => {
        const store = /** @type {any} */ (window).__appStore;
        if (store) {
          store.dispatch({ type: "settings/changed", name: "isFramingOn", value: true });
        }
      });
      await settle(page);

      const cameraReframed = await readCamera(page);
      expect(cameraReframed.zoomTarget).toBeGreaterThanOrEqual(2);
    } finally {
      await context.close();
    }
  });

  test("CAM-03 switching indicator or level does not modify camera or trigger framing", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const cameraInitial = await readCamera(page);

      // Change indicator
      const gdpRadio = page.locator('input[type="radio"][name="indicator"][value="gdpPerCapita"]');
      await gdpRadio.check();
      await settle(page);

      const cameraIndicator = await readCamera(page);
      expect(cameraIndicator).toEqual(cameraInitial);

      // Change level
      const regionRadio = page.locator('input[type="radio"][name="level"][value="region"]');
      await regionRadio.check();
      await settle(page);

      const cameraRegion = await readCamera(page);
      expect(cameraRegion).toEqual(cameraInitial);
    } finally {
      await context.close();
    }
  });

  test("CAM-04 wheel -100px over map zooms in 1 level anchored; wheel over sidebar does not alter camera", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const canvas = page.locator("#map-canvas");
      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();

      if (canvasBox) {
        const cursorX = canvasBox.x + canvasBox.width / 2;
        const cursorY = canvasBox.y + canvasBox.height / 2;
        await page.mouse.move(cursorX, cursorY);

        const groundPointBefore = await page.evaluate(
          ({ x, y }) => {
            const inspector = /** @type {any} */ (window).mapInspector;
            return inspector.readGroundPointAt(x, y);
          },
          { x: cursorX, y: cursorY },
        );
        expect(groundPointBefore).not.toBeNull();

        // Wheel delta -100px over map advances zoom
        await page.mouse.wheel(0, -100);
        await settle(page);

        const camera = await readCamera(page);
        expect(camera.zoomTarget).toBe(1.5);

        // Ground point under cursor stays anchored within 2px
        const projectedAfter = await page.evaluate((pt) => {
          const inspector = /** @type {any} */ (window).mapInspector;
          return inspector.projectGroundPoint(pt);
        }, groundPointBefore);

        expect(Math.abs(projectedAfter.x - cursorX)).toBeLessThanOrEqual(2.5);
        expect(Math.abs(projectedAfter.y - cursorY)).toBeLessThanOrEqual(2.5);

        // Selection is untouched
        const selection = await readSelection(page);
        expect(selection).toEqual([]);

        // Wheel over sidebar scrolls sidebar and does not alter camera
        const cameraBeforeSidebarWheel = await readCamera(page);
        const sidebar = page.locator(".sidebar-content");
        const sidebarBox = await sidebar.boundingBox();
        if (sidebarBox) {
          await page.mouse.move(sidebarBox.x + sidebarBox.width / 2, sidebarBox.y + 100);
          await page.mouse.wheel(0, 50);
          const cameraAfterSidebarWheel = await readCamera(page);
          expect(cameraAfterSidebarWheel).toEqual(cameraBeforeSidebarWheel);
        }
      }
    } finally {
      await context.close();
    }
  });

  test("CAM-05 pinch wheel with ctrlKey accumulates displacement with 100px threshold", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      // 10 events of -5 = -50px, below threshold of 100px
      await page.evaluate(() => {
        const canvas = document.getElementById("map-canvas");
        if (canvas) {
          for (let i = 0; i < 10; i += 1) {
            canvas.dispatchEvent(
              new WheelEvent("wheel", {
                deltaY: -5,
                ctrlKey: true,
                clientX: 600,
                clientY: 450,
                bubbles: true,
                cancelable: true,
              }),
            );
          }
        }
      });
      await settle(page);

      const cameraTenEvents = await readCamera(page);
      expect(cameraTenEvents.zoomTarget).toBe(1);

      // 15 more events of -5 = total 25 events (-125px), passing 100px threshold
      await page.evaluate(() => {
        const canvas = document.getElementById("map-canvas");
        if (canvas) {
          for (let i = 0; i < 15; i += 1) {
            canvas.dispatchEvent(
              new WheelEvent("wheel", {
                deltaY: -5,
                ctrlKey: true,
                clientX: 600,
                clientY: 450,
                bubbles: true,
                cancelable: true,
              }),
            );
          }
        }
      });
      await settle(page);

      const cameraTwentyFiveEvents = await readCamera(page);
      expect(cameraTwentyFiveEvents.zoomTarget).toBe(1.5);
    } finally {
      await context.close();
    }
  });

  test("CAM-06 with reduced motion, zoom arrives at target in the first frame", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
      reducedMotion: "reduce",
    });
    try {
      const zoomIn = page.locator("#zoom-in");
      await zoomIn.click();

      // Immediately check zoom matches target without waiting for transitions
      const camera = await readCamera(page);
      expect(camera.zoom).toBe(camera.zoomTarget);
      expect(camera.zoomTarget).toBe(1.5);
    } finally {
      await context.close();
    }
  });

  test("CAM-07 zoom by button, wheel and drag > 5px do not modify readSelection", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      expect(await readSelection(page)).toEqual([]);

      // Zoom via button
      const zoomIn = page.locator("#zoom-in");
      await zoomIn.click();
      await settle(page);
      expect(await readSelection(page)).toEqual([]);

      // Zoom via wheel
      const canvas = page.locator("#map-canvas");
      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();

      if (canvasBox) {
        const cx = canvasBox.x + canvasBox.width / 2;
        const cy = canvasBox.y + canvasBox.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.wheel(0, -100);
        await settle(page);
        expect(await readSelection(page)).toEqual([]);

        // Drag > 5px (drag threshold is 5px)
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 60, cy + 40, { steps: 5 });
        await page.mouse.up();
        await settle(page);
        expect(await readSelection(page)).toEqual([]);
      }

      // Reset view button
      const zoomReset = page.locator("#zoom-reset");
      await zoomReset.click();
      await settle(page);
      expect(await readSelection(page)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("CAM-08 zoom buttons update disabled state when zooming via mouse wheel", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const zoomIn = page.locator("#zoom-in");
      const zoomOut = page.locator("#zoom-out");

      // Initial state at zoom 1: zoom-in is enabled, zoom-out is disabled
      await expect(zoomIn).toBeEnabled();
      await expect(zoomOut).toBeDisabled();

      // Zoom in with wheel
      const canvas = page.locator("#map-canvas");
      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      if (canvasBox) {
        const cx = canvasBox.x + canvasBox.width / 2;
        const cy = canvasBox.y + canvasBox.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.wheel(0, -100);
        await settle(page);

        // After zooming in, zoom-out must become enabled
        await expect(zoomOut).toBeEnabled();
        await expect(zoomIn).toBeEnabled();

        // Zoom all the way in past max zoom (7 steps of -100)
        for (let i = 0; i < 7; i += 1) {
          await page.mouse.wheel(0, -100);
        }
        await settle(page);

        // At max zoom, zoom-in must be disabled
        await expect(zoomIn).toBeDisabled();
        await expect(zoomOut).toBeEnabled();

        // Reset view button resets to zoom 1, re-disabling zoom-out
        const zoomReset = page.locator("#zoom-reset");
        await zoomReset.click();
        await settle(page);

        await expect(zoomIn).toBeEnabled();
        await expect(zoomOut).toBeDisabled();
      }
    } finally {
      await context.close();
    }
  });
});
