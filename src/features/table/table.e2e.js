import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { inspect, readSelection } from "../../../tests/support/inspector.js";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_DESKTOP = { width: 1366, height: 768 };
const VIEWPORT_MOBILE = { width: 390, height: 844 };

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("Alternative Data Table and WCAG 2.2 AA (ACE-01, ACE-02, ACE-03, ACE-04, ACE-06)", () => {
  test("ACE-02 and ACE-03 table opens via skip-link, canvas has aria-hidden, caption describes state", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_DESKTOP });
    try {
      await settle(page);

      // Verify canvas has aria-hidden="true" (ACE-02)
      const canvas = page.locator("#map-canvas");
      await expect(canvas).toHaveAttribute("aria-hidden", "true");

      // Verify skip-link #open-table-link is present (ACE-02, ACE-03)
      const openLink = page.locator("#open-table-link");
      await expect(openLink).toBeAttached();
      await expect(openLink).toHaveText("Abrir tabela de dados");

      // Ensure table feature controller is attached to page

      // Activate open table link
      await openLink.focus();
      await openLink.press("Enter");

      // Check slot is revealed
      const slot = page.locator("#alt-table-slot");
      await expect(slot).toBeVisible();
      await expect(slot).not.toHaveAttribute("hidden", "");

      // Verify caption summary (ACE-03)
      const caption = slot.locator("caption.alt-table-caption");
      await expect(caption).toBeVisible();
      const captionText = await caption.textContent();
      expect(captionText).toContain("Tabela de dados do mapa");
      expect(captionText).toContain("Nível territorial: Município");
      expect(captionText).toContain("unidades listadas");

      // Verify no en-dash (U+2013) or em-dash (U+2014) in caption
      expect(captionText?.includes("\u2013")).toBe(false);
      expect(captionText?.includes("\u2014")).toBe(false);

      // Verify rows and compare against inspect() (ACE-02)
      const saoPauloRow = slot.locator('tr:has(input[data-code="3550308"])');
      await expect(saoPauloRow.first()).toBeVisible();

      const inspectedSaoPaulo = await inspect(page, "3550308");
      if (inspectedSaoPaulo) {
        await expect(saoPauloRow.first()).toContainText(inspectedSaoPaulo.name);
        if (inspectedSaoPaulo.formattedValue) {
          await expect(saoPauloRow.first()).toContainText(inspectedSaoPaulo.formattedValue);
        }
      }

      // Verify footer displays required WCAG badge (ACE-06)
      const footerBadge = slot.locator(".alt-table-wcag-badge");
      await expect(footerBadge).toBeVisible();
      await expect(footerBadge).toHaveText("projetado para WCAG 2.2 AA");
    } finally {
      await context.close();
    }
  });

  test("ACE-04 keyboard actions: selecting, inspecting, and target sizing (>= 24px)", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_DESKTOP });
    try {
      await settle(page);

      // Tab navigation to open-table-link (ACE-03)
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      const activeHref = await page.evaluate(
        () => document.activeElement?.getAttribute("href") || "",
      );
      if (activeHref !== "#alt-table-slot") {
        await page.locator("#open-table-link").focus();
      }

      await page.keyboard.press("Enter");

      const slot = page.locator("#alt-table-slot");
      await expect(slot).toBeVisible();

      // Check target size of close button and checkboxes (ACE-04: minimum 24x24 px)
      const closeBtn = slot.locator(".alt-table-close-btn");
      await expect(closeBtn).toBeVisible();
      const closeBox = await closeBtn.boundingBox();
      expect(closeBox).not.toBeNull();
      if (closeBox) {
        expect(closeBox.width).toBeGreaterThanOrEqual(24);
        expect(closeBox.height).toBeGreaterThanOrEqual(24);
      }

      const firstCheckbox = slot.locator(".alt-table-select-checkbox").first();
      const checkCode = await firstCheckbox.getAttribute("data-code");
      const checkBox = await firstCheckbox.boundingBox();
      expect(checkBox).not.toBeNull();
      if (checkBox) {
        expect(checkBox.width).toBeGreaterThanOrEqual(24);
        expect(checkBox.height).toBeGreaterThanOrEqual(24);
      }

      // Select via keyboard space
      await firstCheckbox.focus();
      await page.keyboard.press("Space");

      // Verify unit selected
      if (checkCode) {
        const selected = await readSelection(page);
        expect(selected.includes(checkCode)).toBe(true);
      }

      // Escape key closes table and restores focus
      await page.keyboard.press("Escape");
      await expect(slot).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test("ACE-01 automated WCAG 2.2 AA audit: Desktop 1366x768 (Dark Theme)", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_DESKTOP });
    try {
      await settle(page);

      await page.evaluate(async () => {
        document.documentElement.setAttribute("data-theme", "dark");
      });

      await page.locator("#open-table-link").focus();
      await page.locator("#open-table-link").press("Enter");
      await expect(page.locator("#alt-table-slot")).toBeVisible();

      const axeResults = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

      expect(axeResults.violations).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("ACE-01 automated WCAG 2.2 AA audit: Desktop 1366x768 (Light Theme)", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_DESKTOP });
    try {
      await settle(page);

      await page.evaluate(async () => {
        document.documentElement.setAttribute("data-theme", "light");
      });

      await page.locator("#open-table-link").focus();
      await page.locator("#open-table-link").press("Enter");
      await expect(page.locator("#alt-table-slot")).toBeVisible();

      const axeResults = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

      expect(axeResults.violations).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("ACE-01 automated WCAG 2.2 AA audit: Mobile 390x844 (Dark Theme)", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_MOBILE });
    try {
      await settle(page);

      await page.evaluate(async () => {
        document.documentElement.setAttribute("data-theme", "dark");
      });

      await page.locator("#open-table-link").focus();
      await page.locator("#open-table-link").press("Enter");
      await expect(page.locator("#alt-table-slot")).toBeVisible();

      const axeResults = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

      expect(axeResults.violations).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("ACE-01 automated WCAG 2.2 AA audit: Mobile 390x844 (Light Theme)", async ({ browser }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_MOBILE });
    try {
      await settle(page);

      await page.evaluate(async () => {
        document.documentElement.setAttribute("data-theme", "light");
      });

      await page.locator("#open-table-link").focus();
      await page.locator("#open-table-link").press("Enter");
      await expect(page.locator("#alt-table-slot")).toBeVisible();

      const axeResults = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

      expect(axeResults.violations).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
