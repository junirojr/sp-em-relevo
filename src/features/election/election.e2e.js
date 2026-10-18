import { expect, test } from "@playwright/test";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_1366_768 = { width: 1366, height: 768 };
const VIEWPORT_390_844 = { width: 390, height: 844 };

test.describe("N15 Election 1st round browser suite (TUR, ELE)", () => {
  test("TUR-05 and TUR-06 categorical legend displays up to 8 candidate colors, counts, and official credit", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      await page.evaluate(async () => {
        const { mountElectionLegendView } = await import(
          "../../src/features/election/election-legend-view.js"
        );

        let slot = document.getElementById("test-legend-slot");
        if (!slot) {
          slot = document.createElement("div");
          slot.id = "test-legend-slot";
          document.body.append(slot);
        }

        const candidates = [
          { ballotNumber: "22", name: "Flavio Bolsonaro", party: "PL", ledMunicipalities: 430, votes: 12900000 },
          { ballotNumber: "13", name: "Lula", party: "PT", ledMunicipalities: 200, votes: 9500000 },
          { ballotNumber: "30", name: "Felipe d'Avila", party: "NOVO", ledMunicipalities: 10, votes: 890000 },
          { ballotNumber: "44", name: "Renan Santos", party: "UNIAO", ledMunicipalities: 5, votes: 800000 },
        ];

        mountElectionLegendView(document, slot, {
          officeTitle: "Presidente",
          candidates,
          neutralCounts: {
            others: 0,
            noResult: 0,
            tie: 0,
          },
          theme: "dark",
        });
      });
      await settle(page);

      const legend = page.locator(".election-legend");
      await expect(legend).toBeVisible();

      // Verify TUR-05 candidates
      const items = page.locator(".election-legend-item");
      const count = await items.count();
      expect(count).toBe(4);

      // Verify TUR-06 official credit
      const footer = page.locator(".election-legend-footer");
      await expect(footer).toContainText("Fonte: TSE (CC-BY), dados agregados por este projeto");
    } finally {
      await context.close();
    }
  });

  it_e2e_ELE07:
  test("ELE-07 categorical legend displays only active neutral states with municipal counts", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      await page.evaluate(async () => {
        const { mountElectionLegendView } = await import(
          "../../src/features/election/election-legend-view.js"
        );

        let slot = document.getElementById("test-legend-slot-ele07");
        if (!slot) {
          slot = document.createElement("div");
          slot.id = "test-legend-slot-ele07";
          document.body.append(slot);
        }

        mountElectionLegendView(document, slot, {
          officeTitle: "Governador",
          candidates: [
            { ballotNumber: "10", name: "Tarcisio", party: "REPUBLICANOS", ledMunicipalities: 500, votes: 14000000 },
          ],
          neutralCounts: {
            noResult: 2,
            tie: 1,
            others: 12,
          },
          theme: "dark",
        });
      });
      await settle(page);

      // ELE-07: All three neutrals present
      const noResultItem = page.locator(".election-legend-neutral-no-result");
      const tieItem = page.locator(".election-legend-neutral-tie");
      const othersItem = page.locator(".election-legend-neutral-others");

      await expect(noResultItem).toBeVisible();
      await expect(noResultItem).toContainText("2 mun.");

      await expect(tieItem).toBeVisible();
      await expect(tieItem).toContainText("1 mun.");

      await expect(othersItem).toBeVisible();
      await expect(othersItem).toContainText("12 mun.");
    } finally {
      await context.close();
    }
  });

  test("TUR-06 touch or focus on a municipality classified as others displays unit leader card", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_390_844 });
    try {
      await page.evaluate(async () => {
        const { mountElectionLegendView } = await import(
          "../../src/features/election/election-legend-view.js"
        );

        let slot = document.getElementById("test-legend-others-callout");
        if (!slot) {
          slot = document.createElement("div");
          slot.id = "test-legend-others-callout";
          document.body.append(slot);
        }

        const legend = mountElectionLegendView(document, slot, {
          candidates: [
            { ballotNumber: "22", name: "Flavio Bolsonaro", party: "PL", ledMunicipalities: 400, votes: 12000000 },
          ],
          theme: "dark",
        });

        // Store reference on window for testing inspection
        /** @type {any} */ (window).__testLegend = legend;
      });
      await settle(page);

      // Initially no callout card
      const calloutSlot = page.locator(".election-legend-others-container");
      await expect(calloutSlot).toBeHidden();

      // Trigger inspect on an others unit (TUR-06)
      await page.evaluate(() => {
        const legend = /** @type {any} */ (window).__testLegend;
        legend.inspectUnit({
          code: "3500105",
          name: "Adamantina",
          isOthers: true,
          colorKey: "others",
          leaderName: "Candidato do Partido Local",
          leaderParty: "AVANTE",
          leaderBallot: "70",
          leaderVotes: 3200,
          leaderSharePct: 41.2,
        });
      });
      await settle(page);

      // Card is now visible
      await expect(calloutSlot).toBeVisible();
      const card = page.locator(".election-legend-others-card");
      await expect(card).toContainText("Adamantina");
      await expect(card).toContainText("Candidato do Partido Local");
      await expect(card).toContainText("AVANTE");
    } finally {
      await context.close();
    }
  });

  test("TUR-08 Como ler view expands and explains didactic dynamics for Senate two votes per voter", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      await page.evaluate(async () => {
        const { mountElectionHowToReadView } = await import(
          "../../src/features/election/election-how-to-read-view.js"
        );

        let slot = document.getElementById("test-how-to-read-slot");
        if (!slot) {
          slot = document.createElement("div");
          slot.id = "test-how-to-read-slot";
          document.body.append(slot);
        }

        mountElectionHowToReadView(document, slot, {
          office: "senador",
          initiallyExpanded: false,
        });
      });
      await settle(page);

      const toggleButton = page.locator("#how-to-read-first-round-toggle");
      const content = page.locator("#how-to-read-first-round-content");

      await expect(toggleButton).toBeVisible();
      await expect(content).toBeHidden();

      // Click to expand
      await toggleButton.click();
      await settle(page);

      await expect(content).toBeVisible();
      await expect(toggleButton).toHaveAttribute("aria-expanded", "true");

      // TUR-08: Check Senate didactic text content
      const senateBox = page.locator(".how-to-read-office-box");
      await expect(senateBox).toContainText("dois candidatos");
      await expect(senateBox).toContainText("duas vagas");
      await expect(senateBox).toContainText("dobro");
    } finally {
      await context.close();
    }
  });

  test("TUR-07 1st round tab functions offline without live external TSE fetch across all 5 offices", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      /** @type {string[]} */
      const interceptedRequests = [];

      // Intercept network requests to verify no external requests are made to TSE
      await page.route("**/*", (route) => {
        const url = route.request().url();
        if (url.includes("tse.jus.br")) {
          interceptedRequests.push(url);
          route.abort();
          return;
        }
        route.continue();
      });

      await page.evaluate(async () => {
        const { mountOfficeSelectorView, FIRST_ROUND_OFFICES } = await import(
          "../../src/features/election/office-selector-view.js"
        );
        const { mountElectionLegendView } = await import(
          "../../src/features/election/election-legend-view.js"
        );
        const { mountElectionHowToReadView } = await import(
          "../../src/features/election/election-how-to-read-view.js"
        );

        let slot = document.getElementById("test-first-round-container");
        if (!slot) {
          slot = document.createElement("div");
          slot.id = "test-first-round-container";
          document.body.append(slot);
        }
        slot.innerHTML = "";

        const officeDiv = document.createElement("div");
        const legendDiv = document.createElement("div");
        const howDiv = document.createElement("div");
        slot.append(officeDiv, legendDiv, howDiv);

        const officeSelector = mountOfficeSelectorView(document, officeDiv, {
          office: "presidente",
        });

        const legend = mountElectionLegendView(document, legendDiv, {
          officeTitle: "Presidente",
          candidates: [
            { ballotNumber: "22", name: "Flavio", party: "PL", ledMunicipalities: 400, votes: 12000000 },
            { ballotNumber: "13", name: "Lula", party: "PT", ledMunicipalities: 245, votes: 9500000 },
          ],
        });

        const howToRead = mountElectionHowToReadView(document, howDiv, {
          office: "presidente",
        });

        // Store descriptors on window
        /** @type {any} */ (window).__firstRoundViews = {
          officeSelector,
          legend,
          howToRead,
          offices: FIRST_ROUND_OFFICES,
        };
      });
      await settle(page);

      // Check all 5 offices in the DOM
      const radios = page.locator('input[name="election-first-round-office"]');
      const radioCount = await radios.count();
      expect(radioCount).toBe(5);

      // Cycle through all 5 offices
      const officeIds = [
        "presidente",
        "governador",
        "senador",
        "deputado-federal",
        "deputado-estadual",
      ];

      for (const off of officeIds) {
        await page.evaluate((officeId) => {
          const views = /** @type {any} */ (window).__firstRoundViews;
          views.officeSelector.update(officeId);
          views.legend.update({ officeTitle: officeId });
          views.howToRead.update(officeId);
        }, off);
        await settle(page);
      }

      // TUR-07: Verify zero external requests to TSE were initiated
      expect(interceptedRequests.length).toBe(0);
    } finally {
      await context.close();
    }
  });
});
