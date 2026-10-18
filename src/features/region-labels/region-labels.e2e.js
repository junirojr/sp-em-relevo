import { expect, test } from "@playwright/test";
import { openPage, settle } from "../../../tests/support/page.js";
import { areBoxesOverlapping } from "./region-labels-view.js";

const VIEWPORT_1366_768 = { width: 1366, height: 768 };
const VIEWPORT_390_844 = { width: 390, height: 844 };

test.describe("REG region labels slice (REG-03, BAS-04, BAS-09)", () => {
  test("REG-03 visible region labels do not overlap in 1366x768 across light and dark themes", async ({
    browser,
  }) => {
    // Light theme
    const { context: lightCtx, page: lightPage } = await openPage(browser, {
      viewport: VIEWPORT_1366_768,
    });
    try {
      const labels = lightPage.locator(".region-label:visible");
      const count = await labels.count();
      if (count > 0) {
        const boxes = [];
        for (let i = 0; i < count; i += 1) {
          const box = await labels.nth(i).boundingBox();
          if (box) {
            boxes.push(box);
          }
        }

        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            const overlap = areBoxesOverlapping(boxes[i], boxes[j], 0);
            expect(overlap).toBe(false);
          }
        }
      }
    } finally {
      await lightCtx.close();
    }

    // Dark theme
    const { context: darkCtx, page: darkPage } = await openPage(browser, {
      viewport: VIEWPORT_1366_768,
      colorScheme: "dark",
    });
    try {
      const labels = darkPage.locator(".region-label:visible");
      const count = await labels.count();
      if (count > 0) {
        const boxes = [];
        for (let i = 0; i < count; i += 1) {
          const box = await labels.nth(i).boundingBox();
          if (box) {
            boxes.push(box);
          }
        }

        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            const overlap = areBoxesOverlapping(boxes[i], boxes[j], 0);
            expect(overlap).toBe(false);
          }
        }
      }
    } finally {
      await darkCtx.close();
    }
  });

  test("REG-03 visible region labels do not overlap in 390x844 (mobile)", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, {
      viewport: VIEWPORT_390_844,
    });
    try {
      const labels = page.locator(".region-label:visible");
      const count = await labels.count();
      if (count > 0) {
        const boxes = [];
        for (let i = 0; i < count; i += 1) {
          const box = await labels.nth(i).boundingBox();
          if (box) {
            boxes.push(box);
          }
        }

        for (let i = 0; i < boxes.length; i += 1) {
          for (let j = i + 1; j < boxes.length; j += 1) {
            const overlap = areBoxesOverlapping(boxes[i], boxes[j], 0);
            expect(overlap).toBe(false);
          }
        }
      }
    } finally {
      await context.close();
    }
  });

  test("BAS-04 idle map remains settled and frame count does not increase without interaction", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, {
      viewport: VIEWPORT_1366_768,
    });
    try {
      await settle(page);
      const frameCountBefore = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        if (!inspector || typeof inspector.readFrameCount !== "function") {
          return 0;
        }
        return inspector.readFrameCount();
      });

      await page.waitForTimeout(500);

      const frameCountAfter = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        if (!inspector || typeof inspector.readFrameCount !== "function") {
          return 0;
        }
        return inspector.readFrameCount();
      });

      expect(frameCountAfter).toBe(frameCountBefore);
    } finally {
      await context.close();
    }
  });
});
