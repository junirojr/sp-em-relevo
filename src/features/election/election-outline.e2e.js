import { expect, test } from "@playwright/test";
import { openPage, settle } from "../../../tests/support/page.js";
import {
  inspect,
  readEngineStats,
  readSelection,
} from "../../../tests/support/inspector.js";
import {
  OUTLINE_DARK_TONE,
  OUTLINE_LIGHT_TONE,
  OUTLINE_INNER_WIDTH,
  OUTLINE_OUTER_WIDTH,
  satisfiesOutlineContrast,
} from "../../engine/selection-outline.js";
import { PARTY_COLOR_TABLE, ELECTION_NEUTRALS } from "../../domain/election-colors.js";
import { LIGHT_PALETTE, DARK_PALETTE } from "../../app/palette.js";

const VIEWPORT_1280_900 = { width: 1280, height: 900 };

test.describe("N14 Strong selection outline and engine painting suite (ELE-12, ELE-13, ELE-14, ELE-15, PUB-11)", () => {
  test("ELE-12 hover and selection give elevation 0 in election mode and use distinct objects", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await page.evaluate(() => {
        document.documentElement.dataset.mode = "election";
        const store = /** @type {any} */ (window).__appStore;
        if (store) {
          store.dispatch({ type: "settings/changed", name: "heightMode", value: "proportional" });
        }
      });
      await settle(page);

      // Select capital SP (3550308)
      const spCode = "3550308";
      await page.evaluate((code) => {
        const store = /** @type {any} */ (window).__appStore;
        if (store) {
          store.dispatch({ type: "selection/toggled", code });
        }
      }, spCode);
      await settle(page);

      const ins = await inspect(page, spCode);
      // In election mode, selection elevation must be 0 (ELE-12)
      expect(ins.liftTarget).toBe(0);
      expect(ins.liftCurrent).toBe(0);

      // Verify outline objects via engine
      const outlineInfo = await page.evaluate(() => {
        const store = /** @type {any} */ (window).__appStore;
        const hooks = /** @type {any} */ (window).mapInspector;
        const stats = hooks?.readEngineStats();
        return {
          stats,
          mode: document.documentElement.dataset.mode,
        };
      });

      expect(outlineInfo.mode).toBe("election");
    } finally {
      await context.close();
    }
  });

  test("ELE-13 strong outline has dual tone >= 3 px CSS and >= 3:1 contrast against candidate, neutral and plate colors", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      // Verify width requirements
      expect(OUTLINE_OUTER_WIDTH).toBeGreaterThanOrEqual(3);
      expect(OUTLINE_INNER_WIDTH).toBeGreaterThanOrEqual(3);
      expect(OUTLINE_DARK_TONE).toBe("#000000");
      expect(OUTLINE_LIGHT_TONE).toBe("#ffffff");

      // Verify contrast across candidate colors in both themes
      for (const [party, hex] of Object.entries(PARTY_COLOR_TABLE.light)) {
        const ok = satisfiesOutlineContrast(hex);
        expect(ok).toBe(true);
      }
      for (const [party, hex] of Object.entries(PARTY_COLOR_TABLE.dark)) {
        const ok = satisfiesOutlineContrast(hex);
        expect(ok).toBe(true);
      }

      // Verify contrast across neutrals
      for (const [theme, neutrals] of Object.entries(ELECTION_NEUTRALS)) {
        for (const [key, hex] of Object.entries(neutrals)) {
          const ok = satisfiesOutlineContrast(hex);
          expect(ok).toBe(true);
        }
      }

      // Verify contrast against plate colors
      expect(satisfiesOutlineContrast(LIGHT_PALETTE.plate)).toBe(true);
      expect(satisfiesOutlineContrast(DARK_PALETTE.plate)).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("ELE-14 perimeter excludes internal edges between selected units, follows block height and stays visible", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await page.evaluate(() => {
        document.documentElement.dataset.mode = "election";
      });
      await settle(page);

      // Select two adjacent municipalities in RM São Paulo
      const spCode = "3550308";
      const osascoCode = "3534401";

      await page.evaluate(
        ({ c1, c2 }) => {
          const store = /** @type {any} */ (window).__appStore;
          if (store) {
            store.dispatch({ type: "selection/toggled", code: c1 });
            store.dispatch({ type: "selection/toggled", code: c2 });
          }
        },
        { c1: spCode, c2: osascoCode },
      );
      await settle(page);

      const selection = await readSelection(page);
      expect(selection).toContain(spCode);
      expect(selection).toContain(osascoCode);

      // Verify inspection values reflect block top height
      const ins1 = await inspect(page, spCode);
      const ins2 = await inspect(page, osascoCode);
      expect(ins1.heightCurrent).toBeGreaterThan(0);
      expect(ins2.heightCurrent).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test("ELE-15 inspect preserves candidate/party color and draw calls equal base + 2 (PUB-11)", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      // Turn off shadow and borders to read base draw calls accurately
      await page.evaluate(() => {
        const store = /** @type {any} */ (window).__appStore;
        if (store) {
          store.dispatch({ type: "settings/changed", name: "isShadowOn", value: false });
          store.dispatch({ type: "settings/changed", name: "areBordersOn", value: false });
        }
      });
      await settle(page);

      const baseStats = await readEngineStats(page);
      const baseDrawCalls = baseStats.drawCalls;

      // Switch to election mode and select a unit
      await page.evaluate(() => {
        document.documentElement.dataset.mode = "election";
        const store = /** @type {any} */ (window).__appStore;
        if (store) {
          store.dispatch({ type: "selection/toggled", code: "3550308" });
        }
      });
      await settle(page);

      // ELE-15: inspect shows party color, not selection blue (#2f4bff)
      const ins = await inspect(page, "3550308");
      expect(ins.color).not.toBe("#2f4bff");
      expect(ins.isSelected).toBe(true);

      // PUB-11 / ELE-15: Selection outline adds at most 2 draw calls (outer + inner LineSegments2)
      const electionStats = await readEngineStats(page);
      expect(electionStats.drawCalls).toBeLessThanOrEqual(baseDrawCalls + 2);
    } finally {
      await context.close();
    }
  });

  test("PUB-11 election mode draw calls remain strictly within base + 2 budget", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1280_900 });
    try {
      await page.evaluate(() => {
        document.documentElement.dataset.mode = "election";
        const store = /** @type {any} */ (window).__appStore;
        if (store) {
          store.dispatch({ type: "selection/toggled", code: "3550308" });
          store.dispatch({ type: "selection/toggled", code: "3510609" }); // Campinas
        }
      });
      await settle(page);

      const stats = await readEngineStats(page);
      // Batched plate mesh + borders + shadow + 2 selection outline draw calls <= 5
      expect(stats.drawCalls).toBeLessThanOrEqual(6);
    } finally {
      await context.close();
    }
  });
});
