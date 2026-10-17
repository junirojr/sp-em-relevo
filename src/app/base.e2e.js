import { expect, test } from "@playwright/test";
import { aimAt, inspect, readEngineStats, readFrameCount } from "../../tests/support/inspector.js";
import { openPage, settle } from "../../tests/support/page.js";

test("BAS-01 page mounts cleanly in standard context", async ({ browser }) => {
  const { context, page, consoleProblems } = await openPage(browser);
  try {
    const compatMode = await page.evaluate(() => document.compatMode);
    expect(compatMode).toBe("CSS1Compat");
    expect(consoleProblems).toEqual([]);
  } finally {
    await context.close();
  }
});

test("BAS-01 page mounts cleanly with reduced motion", async ({ browser }) => {
  const { context, page, consoleProblems } = await openPage(browser, {
    reducedMotion: "reduce",
  });
  try {
    const compatMode = await page.evaluate(() => document.compatMode);
    expect(compatMode).toBe("CSS1Compat");
    expect(consoleProblems).toEqual([]);
  } finally {
    await context.close();
  }
});

test("BAS-01 page mounts cleanly with dark color scheme", async ({ browser }) => {
  const { context, page, consoleProblems } = await openPage(browser, {
    colorScheme: "dark",
  });
  try {
    const compatMode = await page.evaluate(() => document.compatMode);
    expect(compatMode).toBe("CSS1Compat");
    expect(consoleProblems).toEqual([]);
  } finally {
    await context.close();
  }
});

test("BAS-03 engine stats show 1 batched mesh with 645 instances and 1 draw call when idle", async ({
  browser,
}) => {
  const { context, page } = await openPage(browser);
  try {
    await page.evaluate(() => {
      const store = /** @type {any} */ (window).__appStore;
      store.dispatch({ type: "settings/changed", name: "isShadowOn", value: false });
      store.dispatch({ type: "settings/changed", name: "areBordersOn", value: false });
    });
    await settle(page);
    const stats = await readEngineStats(page);
    expect(stats.meshCount).toBe(1);
    expect(stats.instanceCount).toBe(645);
    expect(stats.drawCalls).toBe(1);
  } finally {
    await context.close();
  }
});

test("BAS-04 frame count does not change when idle and advances on interaction", async ({
  browser,
}) => {
  const { context, page } = await openPage(browser);
  try {
    const frameCount1 = await readFrameCount(page);
    await page.waitForTimeout(1000);
    const frameCount2 = await readFrameCount(page);
    expect(frameCount2).toBe(frameCount1);

    // Mouse movement advances frame count and map settles again
    await page.mouse.move(800, 500);
    await settle(page, 5000);
    const frameCount3 = await readFrameCount(page);
    expect(frameCount3).toBeGreaterThan(frameCount2);
  } finally {
    await context.close();
  }
});

test("BAS-11 pointer micro-movements on raised São Paulo keep the same municipality pointed", async ({
  browser,
}) => {
  const { context, page } = await openPage(browser);
  try {
    const spCode = "3550308";
    const point = await aimAt(page, spCode);
    expect(point).not.toBeNull();
    if (!point) {
      return;
    }

    const offsets = [
      [2, 0],
      [0, 2],
      [-2, 0],
      [0, -2],
      [3, 3],
    ];

    let currentX = point.x;
    let currentY = point.y;

    for (const [dx, dy] of offsets) {
      currentX += dx;
      currentY += dy;
      await page.mouse.move(currentX, currentY);
      await page.waitForTimeout(120);

      const inspection = await inspect(page, spCode);
      expect(inspection.code).toBe(spCode);
    }
  } finally {
    await context.close();
  }
});

test("BAS-12 São Paulo population is 11451999 and pill shows 11.451.999", async ({ browser }) => {
  const { context, page } = await openPage(browser);
  try {
    const spCode = "3550308";
    await aimAt(page, spCode);

    const data = await inspect(page, spCode);
    expect(data.value).toBe(11451999);

    const pillText = await page.textContent("#pointed-pill");
    expect(pillText).toContain("11.451.999");
    expect(pillText).toContain("São Paulo");
  } finally {
    await context.close();
  }
});
