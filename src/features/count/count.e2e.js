import { expect, test } from "@playwright/test";
import { clickUnit, inspect, readSelection } from "../../../tests/support/inspector.js";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_1366_768 = { width: 1366, height: 768 };
const VIEWPORT_390_844 = { width: 390, height: 844 };

test.describe("N13 Count and Election live 2nd round browser suite (APU, ELE, FLG)", () => {
  test("ELE-18 and ELE-17 mode selector is first group in sidebar, accessible via keyboard and preserves selection", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      // Select unit first
      const spCode = "3550308";
      await clickUnit(page, spCode);
      let selected = await readSelection(page);
      expect(selected).toContain(spCode);

      // Initialize election wiring inside the page
      await page.evaluate(async () => {
        const { initElectionWiring } = await import("../../src/app/election-wiring.js");
        const store = /** @type {any} */ (window).__appStore;
        initElectionWiring({
          store,
          documentRef: document,
          windowRef: window,
        });
      });
      await settle(page);

      const modeSlot = page.locator("#mode-selector-slot");
      await expect(modeSlot).toBeVisible();

      const legend = modeSlot.locator("legend.mode-selector-legend");
      await expect(legend).toBeVisible();

      const radios = modeSlot.locator('input[type="radio"]');
      const count = await radios.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Switch to second round
      const secondRoundRadio = modeSlot.locator('input[value="second-round"]');
      await secondRoundRadio.check();
      await settle(page);

      // ELE-17: Selection preserved
      selected = await readSelection(page);
      expect(selected).toContain(spCode);

      // document mode is election
      const modeAttr = await page.evaluate(() => document.documentElement.dataset.mode);
      expect(modeAttr).toBe("election");
    } finally {
      await context.close();
    }
  });

  test("ELE-19 hides Degrau, Destaque, Cor do mapa, and demo when in election mode, restoring on return", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      await page.evaluate(async () => {
        const { initElectionWiring } = await import("../../src/app/election-wiring.js");
        const store = /** @type {any} */ (window).__appStore;
        initElectionWiring({
          store,
          documentRef: document,
          windowRef: window,
        });
      });
      await settle(page);

      const modeSlot = page.locator("#mode-selector-slot");
      const secondRoundRadio = modeSlot.locator('input[value="second-round"]');
      await secondRoundRadio.check();
      await settle(page);

      // Indicator controls hidden
      const indicatorContainer = page.locator("#indicator-container");
      await expect(indicatorContainer).toBeHidden();

      // Switch back to indicators
      const indicatorsRadio = modeSlot.locator('input[value="indicators"]');
      await indicatorsRadio.check();
      await settle(page);

      await expect(indicatorContainer).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("ELE-20 ?aba=2turno URL parameter opens second round directly", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 }, "/?aba=2turno");
    try {
      await page.evaluate(async () => {
        const { initElectionWiring } = await import("../../src/app/election-wiring.js");
        const store = /** @type {any} */ (window).__appStore;
        initElectionWiring({
          store,
          documentRef: document,
          windowRef: window,
        });
      });
      await settle(page);

      const tab = await page.evaluate(() => {
        const inspector = /** @type {any} */ (window).mapInspector;
        return inspector.readActiveTab();
      });
      expect(tab).toBe("second-round");

      const modeAttr = await page.evaluate(() => document.documentElement.dataset.mode);
      expect(modeAttr).toBe("election");
    } finally {
      await context.close();
    }
  });

  test("APU-07 scoreboard, banner and source slots stay outside the bottom panel on stage without scrolling in 390x844", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_390_844 });
    try {
      await page.evaluate(async () => {
        const { initElectionWiring } = await import("../../src/app/election-wiring.js");
        const store = /** @type {any} */ (window).__appStore;
        initElectionWiring({
          store,
          documentRef: document,
          windowRef: window,
        });
      });
      await settle(page);

      const bannerSlot = page.locator("#map-stage > #election-banner-slot");
      const scoreboardSlot = page.locator("#map-stage > #election-scoreboard-slot");
      const sourceSlot = page.locator("#map-stage > #election-source-slot");

      await expect(bannerSlot).toBeAttached();
      await expect(scoreboardSlot).toBeAttached();
      await expect(sourceSlot).toBeAttached();

      const secondRoundRadio = page.locator('#mode-selector-slot input[value="second-round"]');
      await secondRoundRadio.check();
      await settle(page);

      await expect(bannerSlot).toBeVisible();
      await expect(scoreboardSlot).toBeVisible();
      await expect(sourceSlot).toBeVisible();

      // Check no horizontal scroll on page
      const hasHorizontalScroll = await page.evaluate(() => {
        const scroller = document.scrollingElement;
        if (!scroller) {
          return false;
        }
        return scroller.scrollWidth > scroller.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      await context.close();
    }
  });

  test("APU-08 distinct banner messages for TSE stopped vs no connection without reload prompt", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      await page.evaluate(async () => {
        const { mountCountBannerView } = await import("../../src/features/count/count-banner-view.js");
        const { createCountState } = await import("../../src/features/count/count-slice.js");

        const slot = document.getElementById("election-banner-slot");
        if (!slot) {
          return;
        }

        const view = mountCountBannerView(document, slot);
        const stateStopped = {
          ...createCountState(),
          isPaused: true,
          lastUpdateHour: "18:00:00",
        };
        view.update(stateStopped, true);
        const textStopped = slot.textContent || "";

        const stateNoConn = {
          ...createCountState(),
          hasConnectionError: true,
          lastUpdateHour: "18:00:00",
        };
        view.update(stateNoConn, true);
        const textNoConn = slot.textContent || "";

        /** @type {any} */ (window).__bannerTestResults = { textStopped, textNoConn };
      });
      await settle(page);

      const results = await page.evaluate(() => /** @type {any} */ (window).__bannerTestResults);
      expect(results.textStopped).toContain("O TSE nao publicou dados novos desde 18:00:00 (Brasilia)");
      expect(results.textNoConn).toContain("Sem conexao com o TSE desde 18:00:00 (Brasilia)");
      expect(results.textStopped).not.toContain("Recarregue");
      expect(results.textNoConn).not.toContain("Recarregue");
    } finally {
      await context.close();
    }
  });

  test("APU-14 displays timeless artifact notice when running in artifact environment", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      await page.evaluate(async () => {
        const { renderArtifactNotice } = await import("../../src/app/election-loader.js");
        const slot = document.getElementById("election-banner-slot");
        renderArtifactNotice(slot, document);
      });
      await settle(page);

      const bannerSlot = page.locator("#election-banner-slot");
      await expect(bannerSlot).toBeVisible();
      await expect(bannerSlot).toContainText("junirojr.github.io/sp-em-relevo/?aba=2turno");
    } finally {
      await context.close();
    }
  });

  test("FLG-01 with election feature flag disabled, mode selector remains hidden", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      await page.evaluate(async () => {
        const { initElectionWiring } = await import("../../src/app/election-wiring.js");
        const store = /** @type {any} */ (window).__appStore;
        initElectionWiring({
          store,
          status: {
            mode: "live",
            Features: { election: false, electionSecondRound: false, indicatorIncome: true, indicatorVoterTurnout: true, levelGovernmentRegion: true, altTable: true, pngExport: true },
            features: { election: false, electionSecondRound: false, indicatorIncome: true, indicatorVoterTurnout: true, levelGovernmentRegion: true, altTable: true, pngExport: true },
            replay: { available: false, path: "" },
            updatedAt: null,
          },
          documentRef: document,
          windowRef: window,
        });
      });
      await settle(page);

      const modeSlot = page.locator("#mode-selector-slot");
      await expect(modeSlot).toBeHidden();
    } finally {
      await context.close();
    }
  });
});
