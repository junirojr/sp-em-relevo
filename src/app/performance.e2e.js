import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { readEngineStats, readFrameCount } from "../../tests/support/inspector.js";
import { settle } from "../../tests/support/page.js";

const DEFAULT_VIEWPORT = { width: 1280, height: 900 };
const CIRCLE_SAMPLES = 90;
const CIRCLE_RADIUS = 160;

test.describe("BAS-09 performance ceilings and measurements", () => {
  test("BAS-09 CPU per frame under circle movement and mount duration", async ({ browser }) => {
    const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
    const page = await context.newPage();

    // Hook first frame right after requestAnimationFrame callback
    await page.addInitScript(() => {
      const originalRaf = window.requestAnimationFrame;
      let firstFrameRecorded = false;
      window.requestAnimationFrame = (callback) =>
        originalRaf.call(window, (timestamp) => {
          callback(timestamp);
          if (!firstFrameRecorded) {
            const inspector = /** @type {any} */ (window).mapInspector;
            if (inspector && inspector.readFrameCount() >= 1) {
              firstFrameRecorded = true;
              performance.mark("frame:first");
              performance.measure("mount:data-to-first-frame", "data:start", "frame:first");
            }
          }
        });
    });

    try {
      await page.goto("/");
      await settle(page);

      // Measure mount duration from data:start to first frame
      const mountDurationMs = await page.evaluate(() => {
        const entries = performance.getEntriesByName("mount:data-to-first-frame");
        if (entries.length > 0) {
          return entries[0].duration;
        }
        const firstFrame = performance.getEntriesByName("frame:first");
        const dataStart = performance.getEntriesByName("data:start");
        if (firstFrame.length > 0 && dataStart.length > 0) {
          return firstFrame[0].startTime - dataStart[0].startTime;
        }
        return 0;
      });

      // Deterministic check: single draw call when settled without shadows/borders
      await page.evaluate(() => {
        const store = /** @type {any} */ (window).__appStore;
        store.dispatch({ type: "settings/changed", name: "isShadowOn", value: false });
        store.dispatch({ type: "settings/changed", name: "areBordersOn", value: false });
      });
      await settle(page);
      const initialStats = await readEngineStats(page);
      expect(initialStats.drawCalls).toBe(1);

      // Deterministic check: zero frames rendered when idle
      const framesBeforeIdle = await readFrameCount(page);
      await page.waitForTimeout(300);
      const framesAfterIdle = await readFrameCount(page);
      expect(framesAfterIdle).toBe(framesBeforeIdle);

      // Move pointer in a circle over the map canvas to collect 90 frame samples
      const canvas = page.locator("#map-canvas");
      const box = await canvas.boundingBox();
      if (!box) {
        throw new Error("Canvas element bounding box not found");
      }

      const centerX = Math.round(box.x + box.width / 2);
      const centerY = Math.round(box.y + box.height / 2);

      for (let i = 0; i < CIRCLE_SAMPLES; i += 1) {
        const angle = (2 * Math.PI * i) / CIRCLE_SAMPLES;
        const x = Math.round(centerX + CIRCLE_RADIUS * Math.cos(angle));
        const y = Math.round(centerY + CIRCLE_RADIUS * Math.sin(angle));
        await page.mouse.move(x, y);
        await page.evaluate(() => new Promise((resolve) => window.requestAnimationFrame(resolve)));
      }

      const stats = await readEngineStats(page);
      const medianCpuMs = stats.medianRenderDuration;
      const samples = stats.renderTimes;

      // Persist results to test-results/performance.json
      const isReferenceMachine = process.env.REFERENCE_MACHINE === "1";
      const resultsDir = path.resolve(process.cwd(), "test-results");
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }

      const payload = {
        medianCpuMs,
        mountDurationMs,
        samplesCount: samples.length,
        drawCalls: stats.drawCalls,
        referenceMachine: isReferenceMachine,
      };

      fs.writeFileSync(
        path.join(resultsDir, "performance.json"),
        JSON.stringify(payload, null, 2),
        "utf-8",
      );

      // Universal assertions
      expect(samples.length).toBeGreaterThanOrEqual(CIRCLE_SAMPLES);
      expect(medianCpuMs).toBeGreaterThan(0);
      expect(mountDurationMs).toBeGreaterThan(0);

      // Reference machine ceilings (R8, BAS-09)
      if (isReferenceMachine) {
        expect(medianCpuMs).toBeLessThan(1.0);
        expect(mountDurationMs).toBeLessThan(600);
      }
    } finally {
      await context.close();
    }
  });
});
