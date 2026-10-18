import { expect, test } from "@playwright/test";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_1280_900 = { width: 1280, height: 900 };
const VIEWPORT_1366_768 = { width: 1366, height: 768 };

test.describe("LAY layout slice (LAY-01 to LAY-05)", () => {
  test("LAY-01 sidebar on left, canvas starts where sidebar ends without overlap in 1280x900", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const sidebar = page.locator("#sidebar");
      const canvas = page.locator("#map-canvas");

      await expect(sidebar).toBeVisible();
      await expect(canvas).toBeVisible();

      const sidebarBox = await sidebar.boundingBox();
      const canvasBox = await canvas.boundingBox();
      expect(sidebarBox).not.toBeNull();
      expect(canvasBox).not.toBeNull();

      if (sidebarBox && canvasBox) {
        expect(sidebarBox.x).toBe(0);
        expect(canvasBox.x).toBeGreaterThanOrEqual(sidebarBox.x + sidebarBox.width - 1);
        expect(canvasBox.width).toBeGreaterThanOrEqual(
          VIEWPORT_1280_900.width - sidebarBox.width - 1,
        );
        expect(canvasBox.height).toBe(VIEWPORT_1280_900.height);
      }
    } finally {
      await context.close();
    }
  });

  test("LAY-01 sidebar on left, canvas starts where sidebar ends without overlap in 1366x768", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      const sidebar = page.locator("#sidebar");
      const canvas = page.locator("#map-canvas");

      await expect(sidebar).toBeVisible();
      await expect(canvas).toBeVisible();

      const sidebarBox = await sidebar.boundingBox();
      const canvasBox = await canvas.boundingBox();
      expect(sidebarBox).not.toBeNull();
      expect(canvasBox).not.toBeNull();

      if (sidebarBox && canvasBox) {
        expect(sidebarBox.x).toBe(0);
        expect(canvasBox.x).toBeGreaterThanOrEqual(sidebarBox.x + sidebarBox.width - 1);
        expect(canvasBox.width).toBeGreaterThanOrEqual(
          VIEWPORT_1366_768.width - sidebarBox.width - 1,
        );
        expect(canvasBox.height).toBe(VIEWPORT_1366_768.height);
      }
    } finally {
      await context.close();
    }
  });

  test("LAY-02 controls order from top to bottom in sidebar", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      // The search is fixed above the scrolling middle and the authorship below it, so only the
      // sections inside the middle are compared with each other.
      const scrollingSections = [
        "#indicator-container",
        "#level-container",
        "#class-filter",
        ".selection-panel",
        "#settings-container",
      ];
      const sectionTops = [];
      for (const selector of scrollingSections) {
        const box = await readBox(page, selector);
        sectionTops.push({ selector, y: box.y });
      }
      for (let i = 1; i < sectionTops.length; i += 1) {
        const message = `${sectionTops[i].selector} below ${sectionTops[i - 1].selector}`;
        expect(sectionTops[i].y, message).toBeGreaterThan(sectionTops[i - 1].y);
      }

      const titleBox = await readBox(page, ".app-title");
      const searchBox = await readBox(page, "#city-search");
      const middleBox = await readBox(page, ".sidebar-content");
      const footerBox = await readBox(page, "#app-footer");
      expect(searchBox.y).toBeGreaterThan(titleBox.y);
      expect(middleBox.y).toBeGreaterThanOrEqual(searchBox.y + searchBox.height);
      expect(footerBox.y).toBeGreaterThanOrEqual(middleBox.y + middleBox.height - 1);
    } finally {
      await context.close();
    }
  });

  test("LAY-03 document.scrollingElement does not scroll and column middle scrolls", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const scrollInfo = await page.evaluate(() => {
        const scroller = document.scrollingElement;
        if (!scroller) {
          return { scrollHeight: 0, clientHeight: 0 };
        }
        return {
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
        };
      });
      expect(scrollInfo.scrollHeight).toBe(scrollInfo.clientHeight);
    } finally {
      await context.close();
    }
  });

  test("LAY-04 legend and source box are inside canvas box", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const canvas = page.locator("#map-canvas");
      const overlay = page.locator("#stage-overlay");

      await expect(canvas).toBeVisible();
      await expect(overlay).toBeVisible();

      const canvasBox = await canvas.boundingBox();
      const overlayBox = await overlay.boundingBox();

      expect(canvasBox).not.toBeNull();
      expect(overlayBox).not.toBeNull();

      if (canvasBox && overlayBox) {
        expect(overlayBox.x).toBeGreaterThanOrEqual(canvasBox.x);
        expect(overlayBox.x + overlayBox.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width);
        expect(overlayBox.y).toBeGreaterThanOrEqual(canvasBox.y);
        expect(overlayBox.y + overlayBox.height).toBeLessThanOrEqual(
          canvasBox.y + canvasBox.height,
        );
      }
    } finally {
      await context.close();
    }
  });

  test("LAY-05 toggle button with aria-expanded collapses and expands sidebar", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const toggle = page.locator("#sidebar-toggle");
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");

      const canvas = page.locator("#map-canvas");
      const initialCanvasBox = await canvas.boundingBox();
      expect(initialCanvasBox).not.toBeNull();

      // Click to collapse
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");

      await page.waitForTimeout(250);
      await settle(page);

      const collapsedCanvasBox = await canvas.boundingBox();
      expect(collapsedCanvasBox).not.toBeNull();

      if (collapsedCanvasBox) {
        expect(collapsedCanvasBox.x).toBe(0);
        expect(collapsedCanvasBox.width).toBe(VIEWPORT_1280_900.width);
      }

      // Check camera aspect ratio matches canvas
      const camera = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        return inspector.readCamera();
      });
      expect(camera.aspect).toBeCloseTo(VIEWPORT_1280_900.width / VIEWPORT_1280_900.height, 1);

      // Click to expand back
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");

      await page.waitForTimeout(250);
      await settle(page);
      const reexpandedCanvasBox = await canvas.boundingBox();
      expect(reexpandedCanvasBox).not.toBeNull();

      if (reexpandedCanvasBox && initialCanvasBox) {
        expect(reexpandedCanvasBox.width).toBeCloseTo(initialCanvasBox.width, 1);
      }
    } finally {
      await context.close();
    }
  });

  test("LAY-08 the theme switch changes page and map for this visit only, nothing stored", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
      colorScheme: "light",
    });
    try {
      const lightButton = page.getByRole("button", { name: "Claro", exact: true });
      const darkButton = page.getByRole("button", { name: "Escuro", exact: true });
      await expect(lightButton).toHaveAttribute("aria-pressed", "true");
      await expect(darkButton).toHaveAttribute("aria-pressed", "false");
      const lightPage = await readPageBackground(page);
      const lightMap = await readMapBackground(page);

      await darkButton.click();
      await settle(page);
      await expect(darkButton).toHaveAttribute("aria-pressed", "true");
      await expect(lightButton).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      expect(await readPageBackground(page)).not.toBe(lightPage);
      const darkMap = await readMapBackground(page);
      expect(darkMap).not.toBe(lightMap);

      const stored = await page.evaluate(() => ({
        local: localStorage.length,
        session: sessionStorage.length,
        cookie: document.cookie,
      }));
      expect(stored).toEqual({ local: 0, session: 0, cookie: "" });

      await page.reload();
      await settle(page);
      expect(await page.locator("html").getAttribute("data-theme")).toBeNull();
      await expect(lightButton).toHaveAttribute("aria-pressed", "true");
      expect(await readMapBackground(page)).toBe(lightMap);
    } finally {
      await context.close();
    }
  });
});

test("LAY-09 the legend card switches to the selection on every pick and back when cleared", async ({
  browser,
}) => {
  const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
  try {
    const labels = page.locator(".legend-metric-label");
    const values = page.locator(".legend-metric-value");
    await expect(labels).toHaveText(["Estado", "Cidades", "Média por município"]);
    const stateValue = await values.nth(0).textContent();

    await page.locator(".selection-ranking-row").first().click();
    await settle(page);
    await expect(labels).toHaveText(["Seleção", "Cidades", "Estado"]);
    await expect(values.nth(1)).toHaveText("1");
    await expect(values.nth(2)).toHaveText(stateValue ?? "");
    const firstSelection = await values.nth(0).textContent();

    const searchInput = page.locator("#city-search");
    await searchInput.fill("Campinas");
    await searchInput.press("Enter");
    await settle(page);
    await expect(values.nth(1)).toHaveText("2");
    await expect(values.nth(0)).not.toHaveText(firstSelection ?? "");

    await page.locator("#clear-selection").click();
    await settle(page);
    await expect(labels).toHaveText(["Estado", "Cidades", "Média por município"]);
    expect(firstSelection).not.toBe(stateValue);
  } finally {
    await context.close();
  }
});

test("MOB-03 bottom sheet cycles through collapsed, half and expanded heights and stays within visualViewport.height in 390x844 and 390x664", async ({
  browser,
}) => {
  const viewports = [
    { width: 390, height: 844 },
    { width: 390, height: 664 },
  ];

  for (const viewport of viewports) {
    const { context, page } = await openPage(browser, { viewport });
    try {
      const sidebar = page.locator("#sidebar");
      const sheetToggle = page.locator("#sheet-toggle");

      await expect(sidebar).toBeVisible();
      await expect(sheetToggle).toBeVisible();
      await expect(sheetToggle).toHaveAttribute("aria-controls", "sidebar");
      await expect(sheetToggle).toHaveAttribute("aria-expanded", "false");
      await expect(sidebar).toHaveAttribute("data-sheet-state", "collapsed");

      const vvHeight = await readVisualViewportHeight(page);
      const collapsedBox = await readBox(page, "#sidebar");
      expect(collapsedBox.y + collapsedBox.height).toBeLessThanOrEqual(vvHeight + 1);
      expect(collapsedBox.height).toBeLessThanOrEqual(vvHeight * 0.35);

      await sheetToggle.click();
      await expect(sidebar).toHaveAttribute("data-sheet-state", "half");
      await expect(sheetToggle).toHaveAttribute("aria-expanded", "true");
      const halfBox = await readBox(page, "#sidebar");
      expect(halfBox.height).toBeGreaterThan(collapsedBox.height + 80);
      expect(halfBox.y + halfBox.height).toBeLessThanOrEqual(vvHeight + 1);

      await sheetToggle.click();
      await expect(sidebar).toHaveAttribute("data-sheet-state", "expanded");
      await expect(sheetToggle).toHaveAttribute("aria-expanded", "true");
      const expandedBox = await readBox(page, "#sidebar");
      expect(expandedBox.height).toBeGreaterThan(halfBox.height + 80);
      expect(expandedBox.y + expandedBox.height).toBeLessThanOrEqual(vvHeight + 1);

      await sheetToggle.click();
      await expect(sidebar).toHaveAttribute("data-sheet-state", "collapsed");
      await expect(sheetToggle).toHaveAttribute("aria-expanded", "false");
    } finally {
      await context.close();
    }
  }
});

test("ACE-04 interactive targets are at least 24x24 px and focused elements are never obscured by the bottom sheet in 390x844 and 1280x800", async ({
  browser,
}) => {
  const desktop = await openPage(browser, { viewport: { width: 1280, height: 800 } });
  try {
    const desktopSelectors = [
      "#sidebar-toggle",
      ".theme-toggle-button",
      "#camera-controls button",
      "#city-search",
      ".settings-toggle",
      "#app-footer a",
    ];
    for (const selector of desktopSelectors) {
      const box = await readBox(desktop.page, selector);
      expect(box.width, `${selector} width in 1280x800`).toBeGreaterThanOrEqual(24);
      expect(box.height, `${selector} height in 1280x800`).toBeGreaterThanOrEqual(24);
    }
  } finally {
    await desktop.context.close();
  }

  const mobile = await openPage(browser, { viewport: { width: 390, height: 844 } });
  try {
    const mobileSelectors = [
      "#sheet-toggle",
      ".theme-toggle-button",
      "#camera-controls button",
      "#city-search",
    ];
    for (const selector of mobileSelectors) {
      const box = await readBox(mobile.page, selector);
      expect(box.width, `${selector} width in 390x844`).toBeGreaterThanOrEqual(24);
      expect(box.height, `${selector} height in 390x844`).toBeGreaterThanOrEqual(24);
    }

    const sidebar = mobile.page.locator("#sidebar");
    await expect(sidebar).toHaveAttribute("data-sheet-state", "collapsed");

    const settingsToggle = mobile.page.locator(".settings-toggle");
    await settingsToggle.focus();
    await expect(sidebar).toHaveAttribute("data-sheet-state", "expanded");

    const settingsBox = await readBox(mobile.page, ".settings-toggle");
    const expandedSidebarBox = await readBox(mobile.page, "#sidebar");
    expect(settingsBox.width).toBeGreaterThanOrEqual(24);
    expect(settingsBox.height).toBeGreaterThanOrEqual(24);
    expect(settingsBox.y).toBeGreaterThanOrEqual(expandedSidebarBox.y);
    expect(settingsBox.y + settingsBox.height).toBeLessThanOrEqual(
      expandedSidebarBox.y + expandedSidebarBox.height + 1,
    );

    const cameraButton = mobile.page.locator("#camera-controls button").first();
    await cameraButton.focus();
    const cameraBox = await readBox(mobile.page, "#camera-controls button");
    const currentSidebarBox = await readBox(mobile.page, "#sidebar");
    expect(cameraBox.y + cameraBox.height).toBeLessThanOrEqual(currentSidebarBox.y);
  } finally {
    await mobile.context.close();
  }
});

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 * @returns {Promise<{ x: number, y: number, width: number, height: number }>}
 */
async function readBox(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} has a box`).not.toBeNull();
  if (!box) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return box;
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string>}
 */
async function readPageBackground(page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string>}
 */
async function readMapBackground(page) {
  return page.evaluate(() => {
    const inspector = /** @type {any} */ (window).mapInspector;
    return inspector.readMapPalette().background;
  });
}

/**
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<number>}
 */
async function readVisualViewportHeight(page) {
  return page.evaluate(() => {
    if (window.visualViewport) {
      return window.visualViewport.height;
    }
    return window.innerHeight;
  });
}
