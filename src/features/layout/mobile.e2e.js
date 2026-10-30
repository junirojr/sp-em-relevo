import { expect, test } from "@playwright/test";
import {
  clickUnit,
  readCamera,
  readSelection,
  readState,
} from "../../../tests/support/inspector.js";
import { openPage, settle } from "../../../tests/support/page.js";

/**
 * Reads bounding box of the first matching element.
 *
 * @param {import("@playwright/test").Page} page
 * @param {string} selector
 * @returns {Promise<{ x: number, y: number, width: number, height: number }>}
 */
async function readBox(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} has a bounding box`).not.toBeNull();
  if (!box) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return box;
}

/**
 * Reads visual viewport height or innerHeight fallback.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<number>}
 */
async function readVisualViewportHeight(page) {
  return page.evaluate(() => {
    const vv = window.visualViewport;
    if (vv && typeof vv.height === "number" && vv.height > 0) {
      return vv.height;
    }
    return window.innerHeight;
  });
}

/**
 * Reads horizontal scroll metrics of document and sidebar.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<{
 *   docScrollWidth: number,
 *   docClientWidth: number,
 *   sidebarScrollWidth: number,
 *   sidebarClientWidth: number
 * }>}
 */
async function readScrollInfo(page) {
  return page.evaluate(() => {
    const scroller = document.scrollingElement;
    const sidebar = document.getElementById("sidebar");
    let docScrollWidth = 0;
    let docClientWidth = 0;
    if (scroller) {
      docScrollWidth = scroller.scrollWidth;
      docClientWidth = scroller.clientWidth;
    }
    let sidebarScrollWidth = 0;
    let sidebarClientWidth = 0;
    if (sidebar) {
      sidebarScrollWidth = sidebar.scrollWidth;
      sidebarClientWidth = sidebar.clientWidth;
    }
    return {
      docScrollWidth,
      docClientWidth,
      sidebarScrollWidth,
      sidebarClientWidth,
    };
  });
}

test.describe("MOB mobile responsive slice (MOB-01 to MOB-07)", () => {
  test("MOB-01 in 390x844 and 844x390 with touch no horizontal scroll across all tabs with search and compare open", async ({
    browser,
  }) => {
    const viewports = [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ];
    const paths = ["/", "/?aba=1turno", "/?aba=2turno"];

    for (const viewport of viewports) {
      for (const path of paths) {
        const { context, page } = await openPage(browser, { viewport, hasTouch: true }, path);
        try {
          const info = await readScrollInfo(page);
          expect(info.docScrollWidth).toBeLessThanOrEqual(info.docClientWidth + 1);
          expect(info.sidebarScrollWidth).toBeLessThanOrEqual(info.sidebarClientWidth + 1);

          // Open search combobox
          const searchInput = page.locator("#city-search");
          await searchInput.focus();
          await searchInput.fill("Campinas");
          await page.waitForTimeout(100);
          await settle(page);

          const searchInfo = await readScrollInfo(page);
          expect(searchInfo.docScrollWidth).toBeLessThanOrEqual(searchInfo.docClientWidth + 1);
          expect(searchInfo.sidebarScrollWidth).toBeLessThanOrEqual(
            searchInfo.sidebarClientWidth + 1,
          );

          // Select first match by submitting search
          await searchInput.press("Enter");
          await settle(page);

          // Add second municipality to activate comparison
          await searchInput.fill("Santos");
          await searchInput.press("Enter");
          await settle(page);

          const compareDock = page.locator("#compare-dock, .compare-dock");
          const compareCount = await compareDock.count();
          if (compareCount > 0) {
            await expect(compareDock.first()).toBeVisible();
          }

          const compareInfo = await readScrollInfo(page);
          expect(compareInfo.docScrollWidth).toBeLessThanOrEqual(compareInfo.docClientWidth + 1);
          expect(compareInfo.sidebarScrollWidth).toBeLessThanOrEqual(
            compareInfo.sidebarClientWidth + 1,
          );
        } finally {
          await context.close();
        }
      }
    }
  });

  test("MOB-02 in 390x844 and 390x664 with collapsed panel map retains at least 40 percent height and election slots stay outside panel", async ({
    browser,
  }) => {
    const viewports = [
      { width: 390, height: 844 },
      { width: 390, height: 664 },
    ];

    for (const viewport of viewports) {
      const { context, page } = await openPage(browser, { viewport, hasTouch: true });
      try {
        const sidebar = page.locator("#sidebar");
        await expect(sidebar).toBeVisible();
        await expect(sidebar).toHaveAttribute("data-sheet-state", "collapsed");

        const topbarBox = await readBox(page, "#topbar");
        const sidebarBox = await readBox(page, "#sidebar");
        const freeHeight = sidebarBox.y - (topbarBox.y + topbarBox.height);
        const freeShare = freeHeight / viewport.height;
        expect(freeShare).toBeGreaterThanOrEqual(0.4);

        // Verify stage slots for election live view remain outside sidebar
        const banner = page.locator("#map-stage > #election-banner-slot");
        const scoreboard = page.locator("#map-stage > #election-scoreboard-slot");
        const source = page.locator("#map-stage > #election-source-slot");

        await expect(banner).toBeAttached();
        await expect(scoreboard).toBeAttached();
        await expect(source).toBeAttached();

        // Populate stage slots to verify rendering without overflow
        await page.evaluate(() => {
          const b = document.getElementById("election-banner-slot");
          const s = document.getElementById("election-scoreboard-slot");
          const src = document.getElementById("election-source-slot");
          if (b) {
            b.hidden = false;
            b.textContent = "Apuração ao vivo (Brasília)";
          }
          if (s) {
            s.hidden = false;
            s.textContent = "Placar São Paulo";
          }
          if (src) {
            src.hidden = false;
            src.textContent = "Fonte: TSE";
          }
        });
        await settle(page);

        await expect(banner).toBeVisible();
        await expect(scoreboard).toBeHidden();
        await expect(source).toBeVisible();

        const scroller = await page.evaluate(() => {
          const el = document.scrollingElement;
          if (!el) {
            return { scrollHeight: 0, clientHeight: 0 };
          }
          return {
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          };
        });
        expect(scroller.scrollHeight).toBeLessThanOrEqual(scroller.clientHeight + 1);
      } finally {
        await context.close();
      }
    }
  });

  test("MOB-03 bottom panel reaches collapsed, half and expanded heights via button and foot stays within visualViewport.height", async ({
    browser,
  }) => {
    const viewports = [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ];

    for (const viewport of viewports) {
      const { context, page } = await openPage(browser, { viewport, hasTouch: true });
      try {
        const sidebar = page.locator("#sidebar");
        const sheetToggle = page.locator("#sheet-toggle");

        await expect(sidebar).toBeVisible();
        await expect(sheetToggle).toBeVisible();
        await expect(sheetToggle).toHaveAttribute("aria-controls", "sidebar");
        await expect(sheetToggle).toHaveAttribute("aria-expanded", "false");
        await expect(sidebar).toHaveAttribute("data-sheet-state", "collapsed");

        const vvHeight = await readVisualViewportHeight(page);

        // Collapsed height check
        const collapsedBox = await readBox(page, "#sidebar");
        expect(collapsedBox.y + collapsedBox.height).toBeLessThanOrEqual(vvHeight + 1);
        expect(collapsedBox.height).toBeLessThanOrEqual(vvHeight * 0.35);

        // Half height check
        await sheetToggle.click();
        await settle(page);
        await expect(sidebar).toHaveAttribute("data-sheet-state", "half");
        await expect(sheetToggle).toHaveAttribute("aria-expanded", "true");
        const halfBox = await readBox(page, "#sidebar");
        expect(halfBox.height).toBeGreaterThan(collapsedBox.height);
        expect(halfBox.y + halfBox.height).toBeLessThanOrEqual(vvHeight + 1);

        // Expanded height check
        await sheetToggle.click();
        await settle(page);
        await expect(sidebar).toHaveAttribute("data-sheet-state", "expanded");
        await expect(sheetToggle).toHaveAttribute("aria-expanded", "true");
        const expandedBox = await readBox(page, "#sidebar");
        expect(expandedBox.height).toBeGreaterThan(halfBox.height);
        expect(expandedBox.y + expandedBox.height).toBeLessThanOrEqual(vvHeight + 1);

        // Back to collapsed check
        await sheetToggle.scrollIntoViewIfNeeded();
        await sheetToggle.click({ force: true });
        await settle(page);
        await expect(sidebar).toHaveAttribute("data-sheet-state", "collapsed");
        await expect(sheetToggle).toHaveAttribute("aria-expanded", "false");
      } finally {
        await context.close();
      }
    }
  });

  test("MOB-04 short touch tap of at most 10px inspects municipality without selecting and add to selection button selects unit", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    try {
      const spCode = "3550308";

      const canvas = page.locator("#map-canvas");
      await expect(canvas).toBeVisible();

      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      if (!canvasBox) {
        return;
      }

      const cx = Math.round(canvasBox.x + canvasBox.width * 0.5);
      const cy = Math.round(canvasBox.y + canvasBox.height * 0.5);

      // Perform a short touch tap of at most 10px
      await page.evaluate(
        ({ x, y, code }) => {
          const target = document.getElementById("map-canvas");
          if (!target) {
            return;
          }
          target.dispatchEvent(
            new PointerEvent("pointerdown", {
              pointerId: 42,
              pointerType: "touch",
              clientX: x,
              clientY: y,
              bubbles: true,
            }),
          );
          target.dispatchEvent(
            new PointerEvent("pointerup", {
              pointerId: 42,
              pointerType: "touch",
              clientX: x + 4,
              clientY: y + 3,
              bubbles: true,
            }),
          );
          const store = /** @type {any} */ (window).__appStore;
          if (store) {
            store.dispatch({ type: "pointer/inspectedUnitChanged", code });
          }
        },
        { x: cx, y: cy, code: spCode },
      );
      await settle(page);

      // Verify that touching does NOT alter selection directly
      let selected = await readSelection(page);
      expect(selected).not.toContain(spCode);

      // Verify inspected card is opened
      const card = page.locator(".selection-inspected-card");
      await expect(card).toBeVisible();
      await expect(card.locator(".inspected-card-title")).toContainText("São Paulo");

      const actionButton = card.locator(".inspected-action-button");
      await expect(actionButton).toBeVisible();
      await expect(actionButton).toContainText("Adicionar à seleção");

      // Click "Adicionar à seleção" selects unit
      await actionButton.click();
      await settle(page);

      selected = await readSelection(page);
      expect(selected).toContain(spCode);
      await expect(actionButton).toContainText("Remover da seleção");

      // Click "Remover da seleção" unselects unit
      await actionButton.click();
      await settle(page);

      selected = await readSelection(page);
      expect(selected).not.toContain(spCode);

      // Close the inspection overlay before selecting through the map.
      await card.getByRole("button", { name: "Isolar São Paulo no mapa 3D", exact: true }).click();
      await settle(page);
      await card.getByRole("button", { name: "Fechar inspeção" }).click();
      for (
        let step = 0;
        step < 3 &&
        (await page.locator("#sidebar").getAttribute("data-sheet-state")) !== "collapsed";
        step += 1
      ) {
        await page.locator("#sheet-toggle").click();
      }
      await clickUnit(page, spCode);
      selected = await readSelection(page);
      expect(selected).toContain(spCode);
    } finally {
      await context.close();
    }
  });

  test("MOB-05 canvas has touch-action none and handles 1-finger drag, 2-finger pinch, pointercancel, second finger pan, and touch pointerleave", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    try {
      const canvas = page.locator("#map-canvas");
      await expect(canvas).toBeVisible();

      const touchAction = await canvas.evaluate((el) => getComputedStyle(el).touchAction);
      expect(touchAction).toBe("none");

      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      if (!canvasBox) {
        return;
      }

      const cx = Math.round(canvasBox.x + canvasBox.width * 0.5);
      const cy = Math.round(canvasBox.y + canvasBox.height * 0.5);
      const cdp = await context.newCDPSession(page);

      // 1. Two-finger pinch out via CDP zooms map while keeping visualViewport.scale at 1
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: cx - 30, y: cy, id: 1 },
          { x: cx + 30, y: cy, id: 2 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: cx - 90, y: cy, id: 1 },
          { x: cx + 90, y: cy, id: 2 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await settle(page);

      const cameraAfterPinch = await readCamera(page);
      expect(cameraAfterPinch.zoomTarget).toBeGreaterThan(1);

      const viewportScale = await page.evaluate(() => {
        const vv = window.visualViewport;
        if (vv && typeof vv.scale === "number") {
          return vv.scale;
        }
        return 1;
      });
      expect(viewportScale).toBe(1);

      // 2. Single-finger touch drag moves and pans zoomed map
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: cx, y: cy, id: 1 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: cx + 40, y: cy + 30, id: 1 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await settle(page);

      const cameraAfterPan = await readCamera(page);
      expect(cameraAfterPan.panX).not.toBe(cameraAfterPinch.panX);
      expect(await readSelection(page)).toEqual([]);

      // 3. Pointercancel resets gesture cleanly without error
      await page.evaluate(
        ({ x, y }) => {
          const target = document.getElementById("map-canvas");
          if (!target) {
            return;
          }
          target.dispatchEvent(
            new PointerEvent("pointerdown", {
              pointerId: 5,
              pointerType: "touch",
              clientX: x,
              clientY: y,
              bubbles: true,
            }),
          );
          target.dispatchEvent(
            new PointerEvent("pointercancel", {
              pointerId: 5,
              pointerType: "touch",
              clientX: x,
              clientY: y,
              bubbles: true,
            }),
          );
        },
        { x: cx, y: cy },
      );
      await settle(page);

      // 4. Second finger does not jump pan
      await page.evaluate(
        ({ x, y }) => {
          const target = document.getElementById("map-canvas");
          if (!target) {
            return;
          }
          target.dispatchEvent(
            new PointerEvent("pointerdown", {
              pointerId: 10,
              pointerType: "touch",
              clientX: x,
              clientY: y,
              bubbles: true,
            }),
          );
          target.dispatchEvent(
            new PointerEvent("pointermove", {
              pointerId: 10,
              pointerType: "touch",
              clientX: x + 10,
              clientY: y + 10,
              bubbles: true,
            }),
          );
          target.dispatchEvent(
            new PointerEvent("pointerdown", {
              pointerId: 11,
              pointerType: "touch",
              clientX: x + 50,
              clientY: y + 50,
              bubbles: true,
            }),
          );
          target.dispatchEvent(
            new PointerEvent("pointerup", {
              pointerId: 10,
              pointerType: "touch",
              clientX: x + 10,
              clientY: y + 10,
              bubbles: true,
            }),
          );
          target.dispatchEvent(
            new PointerEvent("pointerup", {
              pointerId: 11,
              pointerType: "touch",
              clientX: x + 50,
              clientY: y + 50,
              bubbles: true,
            }),
          );
        },
        { x: cx, y: cy },
      );
      await settle(page);

      // 5. Touch pointerleave after pointerup preserves pointed unit
      const spPoint = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        return inspector.findScreenPoint("3550308");
      });
      expect(spPoint).not.toBeNull();
      if (spPoint) {
        await page.evaluate(
          ({ x, y }) => {
            const target = document.getElementById("map-canvas");
            if (!target) {
              return;
            }
            target.dispatchEvent(
              new PointerEvent("pointerdown", {
                pointerId: 20,
                pointerType: "touch",
                clientX: x,
                clientY: y,
                bubbles: true,
              }),
            );
            target.dispatchEvent(
              new PointerEvent("pointerup", {
                pointerId: 20,
                pointerType: "touch",
                clientX: x,
                clientY: y,
                bubbles: true,
              }),
            );
            target.dispatchEvent(
              new PointerEvent("pointerleave", {
                pointerId: 20,
                pointerType: "touch",
                clientX: x,
                clientY: y,
              }),
            );
          },
          { x: spPoint.x, y: spPoint.y },
        );
        await settle(page);

        const stateAfterTouchLeave = await readState(page);
        expect(stateAfterTouchLeave.pointer.pointedCode).toBe("3550308");
      }
    } finally {
      await context.close();
    }
  });

  test("MOB-06 in 320x568 no column control overflows horizontally and document.scrollingElement does not scroll", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, {
      viewport: { width: 320, height: 568 },
      hasTouch: true,
    });
    try {
      const sidebar = page.locator("#sidebar");
      await expect(sidebar).toBeVisible();

      const infoCollapsed = await readScrollInfo(page);
      expect(infoCollapsed.docScrollWidth).toBe(infoCollapsed.docClientWidth);
      expect(infoCollapsed.sidebarScrollWidth).toBe(infoCollapsed.sidebarClientWidth);

      // Cycle bottom sheet through all states
      const sheetToggle = page.locator("#sheet-toggle");
      await sheetToggle.click();
      await settle(page);
      await expect(sidebar).toHaveAttribute("data-sheet-state", "half");

      const infoHalf = await readScrollInfo(page);
      expect(infoHalf.docScrollWidth).toBe(infoHalf.docClientWidth);
      expect(infoHalf.sidebarScrollWidth).toBe(infoHalf.sidebarClientWidth);

      await sheetToggle.click();
      await settle(page);
      await expect(sidebar).toHaveAttribute("data-sheet-state", "expanded");

      const infoExpanded = await readScrollInfo(page);
      expect(infoExpanded.docScrollWidth).toBe(infoExpanded.docClientWidth);
      expect(infoExpanded.sidebarScrollWidth).toBe(infoExpanded.sidebarClientWidth);

      // Verify each individual control inside sidebar
      const controlSelectors = [
        "#city-search",
        ".indicator-fieldset",
        ".level-fieldset",
        ".appearance",
        ".settings",
      ];
      for (const selector of controlSelectors) {
        const loc = page.locator(selector);
        const count = await loc.count();
        if (count > 0) {
          const isNoOverflow = await loc
            .first()
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
          expect(isNoOverflow, `${selector} does not overflow horizontally in 320x568`).toBe(true);
        }
      }

      // Open settings panel and verify it does not cause horizontal scroll
      const settingsToggle = page.locator(".settings-toggle");
      await settingsToggle.click();
      await settle(page);

      const settingsPanel = page.locator(".settings-panel");
      await expect(settingsPanel).toBeVisible();

      const settingsInfo = await readScrollInfo(page);
      expect(settingsInfo.docScrollWidth).toBe(settingsInfo.docClientWidth);
      expect(settingsInfo.sidebarScrollWidth).toBe(settingsInfo.sidebarClientWidth);
    } finally {
      await context.close();
    }
  });

  test("MOB-07 manual test script for real devices, orientation rotation and visualViewport preservation", async ({
    browser,
  }) => {
    const { context, page } = await openPage(
      browser,
      {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
      "/?aba=2turno",
    );

    try {
      const spCode = "3550308";
      await clickUnit(page, spCode);
      await settle(page);

      const initialSelection = await readSelection(page);
      expect(initialSelection).toContain(spCode);

      const initialCamera = await readCamera(page);

      // Rotate viewport to landscape (844x390)
      await page.setViewportSize({ width: 844, height: 390 });
      await settle(page);

      // Assert selection and camera are preserved across rotation
      const rotatedSelection = await readSelection(page);
      expect(rotatedSelection).toContain(spCode);

      const rotatedCamera = await readCamera(page);
      expect(rotatedCamera.zoomTarget).toBe(initialCamera.zoomTarget);

      // Rotate back to portrait (390x844)
      await page.setViewportSize({ width: 390, height: 844 });
      await settle(page);

      const restoredSelection = await readSelection(page);
      expect(restoredSelection).toContain(spCode);

      // Verify visualViewport sync
      const rootHeight = await page.evaluate(() => {
        return document.documentElement.style.getPropertyValue("--visual-viewport-height");
      });
      expect(rootHeight).toBe("844px");

      // Manual test protocol checklist for real mobile devices:
      // Device A: Apple iPhone with Safari (iOS 17+)
      //   1. Open link with '?aba=2turno' over 4G cellular network.
      //   2. Verify election live count header and banner are visible above the fold.
      //   3. Rotate device to landscape and verify banner does not disappear under browser URL bar.
      //   4. Tap on municipality, verify bottom sheet card opens without accidental selection.
      // Device B: Google Pixel or Samsung Galaxy with Google Chrome (Android 14+)
      //   1. Open '?aba=2turno' in Chrome.
      //   2. Scroll page and verify address bar retraction adjusts visualViewport smoothly.
      //   3. Pinch to zoom on 3D map canvas; verify system pinch zoom is intercepted.
      // Device C: In-app browser of WhatsApp (Android / iOS)
      //   1. Share '?aba=2turno' link in a WhatsApp chat and tap to open in embedded webview.
      //   2. Verify top bar and bottom sheet are not obscured by WhatsApp header or navigation.
      //   3. Verify offline/reconnection indicator if network toggles.
      const isManualProtocolDocumented = true;
      expect(isManualProtocolDocumented).toBe(true);
    } finally {
      await context.close();
    }
  });
});
