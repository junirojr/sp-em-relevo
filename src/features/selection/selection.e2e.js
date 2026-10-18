import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { aimAt, clickUnit, inspect, readSelection } from "../../../tests/support/inspector.js";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_1280_900 = { width: 1280, height: 900 };

const municipalitiesData = JSON.parse(
  fs.readFileSync("data/municipalities.json", "utf8"),
).municipalities;

test.describe("SEL selection slice (SEL-01 to SEL-03, SEL-06, SEL-08, SEL-10)", () => {
  test("SEL-01 click toggles municipality on municipality level and region on region level", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const spCode = "3550308";
      await clickUnit(page, spCode);
      let selected = await readSelection(page);
      expect(selected).toContain(spCode);

      let ins = await inspect(page, spCode);
      expect(ins.isSelected).toBe(true);

      await clickUnit(page, spCode);
      selected = await readSelection(page);
      expect(selected).not.toContain(spCode);

      ins = await inspect(page, spCode);
      expect(ins.isSelected).toBe(false);

      const regionRadio = page.locator('input[type="radio"][name="level"][value="region"]');
      await regionRadio.check();
      await settle(page);

      const santosMun = municipalitiesData.find((/** @type {any} */ m) => m.regionCode === "3");
      expect(santosMun).toBeDefined();

      if (santosMun) {
        const santosRegionCodes = municipalitiesData
          .filter((/** @type {any} */ m) => m.regionCode === "3")
          .map((/** @type {any} */ m) => m.code);

        await clickUnit(page, santosMun.code);
        selected = await readSelection(page);
        for (let i = 0; i < santosRegionCodes.length; i += 1) {
          expect(selected).toContain(santosRegionCodes[i]);
        }

        await clickUnit(page, santosMun.code);
        selected = await readSelection(page);
        for (let i = 0; i < santosRegionCodes.length; i += 1) {
          expect(selected).not.toContain(santosRegionCodes[i]);
        }
      }
    } finally {
      await context.close();
    }
  });

  test("SEL-02 search ignores accents and casing, matching municipality or full region", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const searchInput = page.locator("#city-search");
      await expect(searchInput).toBeVisible();

      await searchInput.fill("sao jose dos campos");
      await searchInput.press("Enter");
      await settle(page);

      let selected = await readSelection(page);
      const sjcCode = "3549904";
      expect(selected).toContain(sjcCode);

      await searchInput.fill("RA Campinas");
      await searchInput.press("Enter");
      await settle(page);

      selected = await readSelection(page);
      const campinasRegionCodes = municipalitiesData
        .filter((/** @type {any} */ m) => m.regionCode === "6")
        .map((/** @type {any} */ m) => m.code);
      expect(campinasRegionCodes.length).toBeGreaterThan(0);
      for (let i = 0; i < campinasRegionCodes.length; i += 1) {
        expect(selected).toContain(campinasRegionCodes[i]);
      }
    } finally {
      await context.close();
    }
  });

  test("SEL-03 class filter dropdown selects all units belonging to the chosen band", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const classSelect = page.locator("#class-filter");
      await expect(classSelect).toBeVisible();

      const options = classSelect.locator("option");
      const optionCount = await options.count();
      expect(optionCount).toBe(8);

      await classSelect.selectOption({ index: 6 });
      await settle(page);

      const selected = await readSelection(page);
      expect(selected.length).toBeGreaterThan(0);

      for (let i = 0; i < Math.min(10, selected.length); i += 1) {
        const ins = await inspect(page, selected[i]);
        expect(ins.classIndex).toBe(5);
      }
    } finally {
      await context.close();
    }
  });

  test("SEL-05 with height as data, selecting keeps the height and lift at rest and hover raises to 7000", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const spCode = "3550308";
      const campinasCode = "3509502";
      const before = await inspect(page, spCode);

      await clickUnit(page, spCode);
      await page.mouse.move(5, 5);
      await settle(page);

      const selected = await inspect(page, spCode);
      expect(selected.isSelected).toBe(true);
      expect(selected.heightTarget).toBe(before.heightTarget);
      expect(selected.liftTarget).toBe(0);
      expect(selected.liftCurrent).toBe(0);

      await aimAt(page, campinasCode);
      await settle(page);

      const hovered = await inspect(page, campinasCode);
      expect(hovered.isPointed).toBe(true);
      expect(hovered.liftTarget).toBe(7000);
      expect(hovered.liftCurrent).toBe(7000);

      const stillSelected = await inspect(page, spCode);
      expect(stillSelected.liftTarget).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("SEL-05 a selected unit is painted with the selection color", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const spCode = "3550308";
      const before = await inspect(page, spCode);
      const selectionColor = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--selection").trim(),
      );

      await clickUnit(page, spCode);
      const selected = await inspect(page, spCode);
      expect(selected.isSelected).toBe(true);
      expect(selected.color).toBe(selectionColor);
      expect(selected.color).not.toBe(before.color);
    } finally {
      await context.close();
    }
  });

  test("SEL-05 with flat height, selection and hover raise", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const spCode = "3550308";
      await page.evaluate(() => {
        const store = /** @type {any} */ (window).__appStore;
        store.dispatch({ type: "settings/changed", name: "heightMode", value: "flat" });
      });
      await settle(page);

      await clickUnit(page, spCode);
      await page.mouse.move(5, 5);
      await settle(page);

      const selected = await inspect(page, spCode);
      expect(selected.isSelected).toBe(true);
      expect(selected.liftTarget).toBe(7000);
    } finally {
      await context.close();
    }
  });

  test("SEL-05 with reduced motion hover and selection do not raise any unit", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, {
      viewport: VIEWPORT_1280_900,
      reducedMotion: "reduce",
    });
    try {
      const spCode = "3550308";
      await clickUnit(page, spCode);
      await page.locator(".selection-row").first().hover();
      await settle(page);

      const ins = await inspect(page, spCode);
      expect(ins.isSelected).toBe(true);
      expect(ins.isPointed).toBe(true);
      expect(ins.liftTarget).toBe(0);
      expect(ins.liftCurrent).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("SEL-09 focus on a panel row raises the unit and leaving drops it", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const spCode = "3550308";
      const topRow = page.locator(".selection-ranking-row").first();
      const rowButton = topRow.getByRole("button");

      await rowButton.focus();
      await settle(page);
      const focused = await inspect(page, spCode);
      expect(focused.isPointed).toBe(true);
      expect(focused.liftTarget).toBe(7000);
      await expect(rowButton).toBeFocused();

      await rowButton.blur();
      await settle(page);
      const left = await inspect(page, spCode);
      expect(left.isPointed).toBe(false);
      expect(left.liftTarget).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("SEL-09 pointer on a panel row raises the unit and leaving drops it", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const spCode = "3550308";
      const topRow = page.locator(".selection-ranking-row").first();

      await topRow.hover();
      await settle(page);
      const hovered = await inspect(page, spCode);
      expect(hovered.isPointed).toBe(true);
      expect(hovered.liftTarget).toBe(7000);
      expect(hovered.liftCurrent).toBe(7000);

      await page.mouse.move(5, 5);
      await settle(page);
      const left = await inspect(page, spCode);
      expect(left.isPointed).toBe(false);
      expect(left.liftTarget).toBe(0);
      expect(left.liftCurrent).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("SEL-06 selected units appear in table with remove buttons and collapsed regions", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const searchInput = page.locator("#city-search");
      await searchInput.fill("RA Campinas");
      await searchInput.press("Enter");
      await settle(page);

      const table = page.locator(".selection-table");
      await expect(table).toBeVisible();

      const regionRow = table.locator(".selection-row");
      await expect(regionRow).toHaveCount(1);
      await expect(regionRow.locator(".selection-cell-name")).toContainText("RA Campinas");

      await searchInput.fill("sao paulo");
      await searchInput.press("Enter");
      await searchInput.blur();
      await settle(page);

      const removeBtn = table
        .locator('.selection-remove-button[aria-label="Tirar São Paulo da seleção"]')
        .first();
      await expect(removeBtn).toBeVisible();
      await removeBtn.dispatchEvent("click");
      await settle(page);

      const selected = await readSelection(page);
      expect(selected).not.toContain("3550308");
    } finally {
      await context.close();
    }
  });

  test("SEL-08 without selection, panel displays top 12 ranking and clicking selects unit", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const rankingRows = page.locator(".selection-ranking-row");
      await expect(rankingRows).toHaveCount(12);

      const topRow = rankingRows.first();
      await expect(topRow.locator(".selection-cell-name")).toContainText("São Paulo");

      await topRow.click();
      await settle(page);

      const selected = await readSelection(page);
      expect(selected).toContain("3550308");
    } finally {
      await context.close();
    }
  });

  test("SEL-10 clear button disabled when empty, empties selection and resets class filter when clicked", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      const clearBtn = page.locator("#clear-selection");
      await expect(clearBtn).toBeVisible();
      await expect(clearBtn).toBeDisabled();

      const searchInput = page.locator("#city-search");
      await searchInput.fill("Santos");
      await searchInput.press("Enter");
      await settle(page);

      await expect(clearBtn).toBeEnabled();

      await clearBtn.click();
      await settle(page);

      const selected = await readSelection(page);
      expect(selected.length).toBe(0);
      await expect(clearBtn).toBeDisabled();

      const classSelect = page.locator("#class-filter");
      await expect(classSelect).toHaveValue("");
    } finally {
      await context.close();
    }
  });

  test("SEL-09 pointer on a region row in ranking raises all its municipalities", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      // Switch level to region
      const regionRadio = page.locator('input[type="radio"][name="level"][value="region"]');
      await regionRadio.check();
      await settle(page);

      // In region level, the ranking rows correspond to regions (top row is RM São Paulo)
      const rankingRows = page.locator(".selection-ranking-row");
      const topRow = rankingRows.first();
      await expect(topRow).toBeVisible();

      // Hovering top row should raise São Paulo (3550308) and Guarulhos (3518800)
      await topRow.hover();
      await settle(page);

      const sp = await inspect(page, "3550308");
      expect(sp.isPointed).toBe(true);
      expect(sp.liftTarget).toBe(7000);

      const guarulhos = await inspect(page, "3518800");
      expect(guarulhos.isPointed).toBe(true);
      expect(guarulhos.liftTarget).toBe(7000);

      // Leaving drops them
      await page.mouse.move(5, 5);
      await settle(page);

      const spLeft = await inspect(page, "3550308");
      expect(spLeft.isPointed).toBe(false);
      expect(spLeft.liftTarget).toBe(0);

      const guarulhosLeft = await inspect(page, "3518800");
      expect(guarulhosLeft.isPointed).toBe(false);
      expect(guarulhosLeft.liftTarget).toBe(0);
    } finally {
      await context.close();
    }
  });

  test("MOB-02 in 390x844 with collapsed sheet the map keeps at least 40% of viewport height and legend docks in panel", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: { width: 390, height: 844 } });
    try {
      const sidebar = page.locator("#sidebar");
      await expect(sidebar).toBeVisible();

      const sheetState = await sidebar.getAttribute("data-sheet-state");
      expect(sheetState).toBe("collapsed");

      const topbar = page.locator("#topbar");
      const topbarBox = await topbar.boundingBox();
      const sidebarBox = await sidebar.boundingBox();
      expect(topbarBox).not.toBeNull();
      expect(sidebarBox).not.toBeNull();

      if (topbarBox && sidebarBox) {
        const freeHeight = sidebarBox.y - (topbarBox.y + topbarBox.height);
        const freeShare = freeHeight / 844;
        expect(freeShare).toBeGreaterThanOrEqual(0.4);
      }

      const legend = page.locator(".stage-overlay");
      await expect(legend).toBeVisible();
      const legendBox = await legend.boundingBox();
      expect(legendBox).not.toBeNull();
      if (legendBox) {
        expect(legendBox.y + legendBox.height).toBeGreaterThanOrEqual(844 - 15);
      }
    } finally {
      await context.close();
    }
  });

  test("MOB-04 and SEL-01 touch tap inspects without altering selection and clicking add to selection selects unit while mouse click selects directly", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: { width: 390, height: 844 } });
    try {
      const spCode = "3550308";

      await page.evaluate((code) => {
        const store = /** @type {any} */ (window).__appStore;
        store.dispatch({ type: "pointer/inspectedUnitChanged", code });
      }, spCode);
      await settle(page);

      let selected = await readSelection(page);
      expect(selected).not.toContain(spCode);

      const card = page.locator(".selection-inspected-card");
      await expect(card).toBeVisible();
      await expect(card.locator(".inspected-card-title")).toContainText("São Paulo");

      const actionBtn = card.locator(".inspected-action-button");
      await expect(actionBtn).toBeVisible();
      await expect(actionBtn).toContainText("Adicionar à seleção");

      await actionBtn.click();
      await settle(page);

      selected = await readSelection(page);
      expect(selected).toContain(spCode);
      await expect(actionBtn).toContainText("Remover da seleção");

      await actionBtn.click();
      await settle(page);

      selected = await readSelection(page);
      expect(selected).not.toContain(spCode);

      await clickUnit(page, spCode);
      selected = await readSelection(page);
      expect(selected).toContain(spCode);
    } finally {
      await context.close();
    }
  });

  test("ELE-18 mode selector remains visible inside collapsed sheet without expanding panel", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: { width: 390, height: 844 } });
    try {
      await page.evaluate(() => {
        const slot = document.getElementById("mode-selector-slot");
        if (slot) {
          slot.hidden = false;
          slot.innerHTML = `
            <fieldset class="mode-selector-group">
              <legend class="mode-selector-legend">Modo</legend>
              <div class="mode-selector-options">
                <label class="mode-selector-option">
                  <input type="radio" name="mode-test" value="indicators" checked> Indicadores
                </label>
                <label class="mode-selector-option">
                  <input type="radio" name="mode-test" value="second-round"> 2º turno
                </label>
              </div>
            </fieldset>
          `;
        }
      });
      await settle(page);

      const sidebar = page.locator("#sidebar");
      const sheetState = await sidebar.getAttribute("data-sheet-state");
      expect(sheetState).toBe("collapsed");

      const modeSlot = page.locator("#mode-selector-slot");
      await expect(modeSlot).toBeVisible();

      const slotBox = await modeSlot.boundingBox();
      const sidebarBox = await sidebar.boundingBox();
      expect(slotBox).not.toBeNull();
      expect(sidebarBox).not.toBeNull();

      if (slotBox && sidebarBox) {
        expect(slotBox.y).toBeGreaterThanOrEqual(sidebarBox.y);
        expect(slotBox.y + slotBox.height).toBeLessThanOrEqual(
          sidebarBox.y + sidebarBox.height + 4,
        );
      }
    } finally {
      await context.close();
    }
  });

  test("APU-07 election scoreboard, banner and source slots stay outside the bottom panel on stage without scrolling", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: { width: 390, height: 844 } });
    try {
      const banner = page.locator("#map-stage > #election-banner-slot");
      const scoreboard = page.locator("#map-stage > #election-scoreboard-slot");
      const source = page.locator("#map-stage > #election-source-slot");

      await expect(banner).toBeAttached();
      await expect(scoreboard).toBeAttached();
      await expect(source).toBeAttached();

      const inSidebar = await page.evaluate(() => {
        const sidebar = document.getElementById("sidebar");
        return {
          banner: Boolean(sidebar?.querySelector("#election-banner-slot")),
          scoreboard: Boolean(sidebar?.querySelector("#election-scoreboard-slot")),
          source: Boolean(sidebar?.querySelector("#election-source-slot")),
        };
      });
      expect(inSidebar.banner).toBe(false);
      expect(inSidebar.scoreboard).toBe(false);
      expect(inSidebar.source).toBe(false);

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
      await expect(scoreboard).toBeVisible();
      await expect(source).toBeVisible();

      const isScrollable = await page.evaluate(() => {
        const scroller = document.scrollingElement;
        if (!scroller) {
          return false;
        }
        return scroller.scrollHeight > scroller.clientHeight;
      });
      expect(isScrollable).toBe(false);
    } finally {
      await context.close();
    }
  });
});

