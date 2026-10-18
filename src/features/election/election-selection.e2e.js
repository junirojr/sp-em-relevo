import { expect, test } from "@playwright/test";
import { openPage, settle } from "../../../tests/support/page.js";

const VIEWPORT_1366_768 = { width: 1366, height: 768 };
const VIEWPORT_390_844 = { width: 390, height: 844 };

test.describe("N16 Election selection, compare, search and table suite (ELE-22, RGV-03, ACE-02, TUR-04)", () => {
  test("ELE-22 election compare and selection displays declared calculation base and margin as difference of 2-decimal percentages", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      const result = await page.evaluate(async () => {
        const {
          buildElectionCompareModel,
          describeElectionCompareSide,
          resolveCalculationBase,
        } = await import("./election-compare-model.js");

        const mockUnits = {
          "3550308": {
            code: "3550308",
            name: "Sao Paulo",
            totalValidVotes: 100000,
            sectionsCounted: 100,
            sectionsTotal: 100,
            candidates: [
              { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 51934 },
              { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 38204 },
            ],
          },
          "3509502": {
            code: "3509502",
            name: "Campinas",
            totalValidVotes: 50000,
            sectionsCounted: 50,
            sectionsTotal: 50,
            candidates: [
              { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 32000 },
              { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 18000 },
            ],
          },
        };

        const senateBase = resolveCalculationBase("senador");
        const presBase = resolveCalculationBase("presidente");

        const compareModel = buildElectionCompareModel(
          [
            { code: "3550308", name: "Sao Paulo" },
            { code: "3509502", name: "Campinas" },
          ],
          mockUnits,
          { office: "senador" },
        );

        return {
          senateBase,
          presBase,
          compareBase: compareModel.calculationBase,
          sideALeaderPct: compareModel.sides[0].leaderPct,
          sideASecondPct: compareModel.sides[0].secondPct,
          sideAMarginPp: compareModel.sides[0].marginPp,
          sideAFormattedMargin: compareModel.sides[0].formattedMargin,
          sideBLeaderPct: compareModel.sides[1].leaderPct,
          sideBSecondPct: compareModel.sides[1].secondPct,
          sideBMarginPp: compareModel.sides[1].marginPp,
          sideBFormattedMargin: compareModel.sides[1].formattedMargin,
        };
      });

      // Verify declared calculation base
      expect(result.senateBase).toContain("dois votos por eleitor no senado");
      expect(result.presBase).toBe("Votos nominais validos");
      expect(result.compareBase).toContain("dois votos por eleitor no senado");

      // Verify margin is direct difference of 2-decimal displayed percentages (51.93 - 38.20 = 13.73)
      expect(result.sideALeaderPct).toBe("51,93%");
      expect(result.sideASecondPct).toBe("38,20%");
      expect(result.sideAMarginPp).toBe(13.73);
      expect(result.sideAFormattedMargin).toBe("13,73 pp");

      // Side B: 64.00% vs 36.00% -> 28.00 pp
      expect(result.sideBLeaderPct).toBe("64,00%");
      expect(result.sideBSecondPct).toBe("36,00%");
      expect(result.sideBMarginPp).toBe(28);
      expect(result.sideBFormattedMargin).toBe("28,00 pp");
    } finally {
      await context.close();
    }
  });

  test("RGV-03 multi-level aggregation in election mode aggregates votes by summing child units across Municipality, RG and RA", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_390_844 });
    try {
      const result = await page.evaluate(async () => {
        const { createTerritory } = await import("../../domain/territory.js");
        const { buildElectionTableRows } = await import("./election-table-model.js");

        const municipalities = [
          {
            code: "3550308",
            name: "Sao Paulo",
            regionCode: "1",
            governmentRegionCode: "rg-40",
            governmentRegionName: "RG de Sao Paulo",
            population: 11000000,
            areaKm2: 1521,
            gdpThousandBrl: 800000000,
          },
          {
            code: "3509502",
            name: "Campinas",
            regionCode: "6",
            governmentRegionCode: "rg-11",
            governmentRegionName: "RG de Campinas",
            population: 1100000,
            areaKm2: 795,
            gdpThousandBrl: 72000000,
          },
          {
            code: "3549904",
            name: "Sao Jose dos Campos",
            regionCode: "4",
            governmentRegionCode: "rg-38",
            governmentRegionName: "RG de Sao Jose dos Campos",
            population: 700000,
            areaKm2: 1099,
            gdpThousandBrl: 39000000,
          },
        ];

        const regions = [
          { code: "1", label: "RM Sao Paulo" },
          { code: "4", label: "RA Sao Jose dos Campos" },
          { code: "6", label: "RA Campinas" },
        ];

        const governmentRegions = [
          { code: "rg-11", label: "RG de Campinas" },
          { code: "rg-38", label: "RG de Sao Jose dos Campos" },
          { code: "rg-40", label: "RG de Sao Paulo" },
        ];

        const territory = createTerritory({ municipalities, regions, governmentRegions });

        const mockUnits = {
          "3509502": {
            code: "3509502",
            name: "Campinas",
            totalValidVotes: 5000,
            candidates: [
              { ballotNumber: 22, name: "Cand B", party: "PL", validVotes: 3500 },
              { ballotNumber: 13, name: "Cand A", party: "PT", validVotes: 1500 },
            ],
          },
          "3549904": {
            code: "3549904",
            name: "Sao Jose dos Campos",
            totalValidVotes: 2000,
            candidates: [
              { ballotNumber: 13, name: "Cand A", party: "PT", validVotes: 1200 },
              { ballotNumber: 22, name: "Cand B", party: "PL", validVotes: 800 },
            ],
          },
          "3550308": {
            code: "3550308",
            name: "Sao Paulo",
            totalValidVotes: 10000,
            candidates: [
              { ballotNumber: 13, name: "Cand A", party: "PT", validVotes: 6500 },
              { ballotNumber: 22, name: "Cand B", party: "PL", validVotes: 3500 },
            ],
          },
        };

        const munRows = buildElectionTableRows({
          level: "municipality",
          mode: "second-round",
          office: "presidente",
          municipalities,
          electionUnits: mockUnits,
          territory,
        });

        const govRows = buildElectionTableRows({
          level: "governmentRegion",
          mode: "second-round",
          office: "presidente",
          municipalities,
          governmentRegions,
          electionUnits: mockUnits,
          territory,
        });

        const regRows = buildElectionTableRows({
          level: "region",
          mode: "second-round",
          office: "presidente",
          municipalities,
          regions,
          electionUnits: mockUnits,
          territory,
        });

        return {
          munCount: munRows.length,
          govCount: govRows.length,
          regCount: regRows.length,
          rg11Leader: govRows.find((r) => r.code === "rg-11")?.leader,
          rg11Margin: govRows.find((r) => r.code === "rg-11")?.margin,
          ra1Leader: regRows.find((r) => r.code === "1")?.leader,
          ra1Margin: regRows.find((r) => r.code === "1")?.margin,
        };
      });

      expect(result.munCount).toBe(3);
      expect(result.govCount).toBe(3);
      expect(result.regCount).toBe(3);
      expect(result.rg11Leader).toBe("Cand B");
      expect(result.rg11Margin).toBe("40,00 pp");
      expect(result.ra1Leader).toBe("Cand A");
      expect(result.ra1Margin).toBe("30,00 pp");
    } finally {
      await context.close();
    }
  });

  test("ACE-02 alternative table in election mode displays unit name, office, leader, party, margin and color in text", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      const result = await page.evaluate(async () => {
        const { buildElectionTableModel } = await import("./election-table-model.js");

        const municipalities = [
          {
            code: "3550308",
            name: "Sao Paulo",
            regionCode: "1",
            governmentRegionCode: "rg-40",
            governmentRegionName: "RG de Sao Paulo",
            population: 11000000,
            areaKm2: 1521,
            gdpThousandBrl: 800000000,
          },
        ];

        const mockUnits = {
          "3550308": {
            code: "3550308",
            name: "Sao Paulo",
            totalValidVotes: 10000,
            sectionsCounted: 100,
            sectionsTotal: 100,
            candidates: [
              { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 6000 },
              { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 4000 },
            ],
          },
        };

        const tableModel = buildElectionTableModel({
          level: "municipality",
          office: "governador",
          mode: "first-round",
          municipalities,
          electionUnits: mockUnits,
        });

        const row = tableModel.rows[0];

        return {
          caption: tableModel.caption,
          footerText: tableModel.footerText,
          columns: tableModel.columns.map((c) => c.key),
          rowName: row.name,
          rowOffice: row.office,
          rowLeader: row.leader,
          rowParty: row.party,
          rowLeaderPct: row.leaderPct,
          rowSecondPct: row.secondPct,
          rowMargin: row.margin,
          rowSectionsPct: row.sectionsPct,
          rowColorText: row.colorText,
        };
      });

      expect(result.footerText).toBe("projetado para WCAG 2.2 AA");
      expect(result.columns).toContain("office");
      expect(result.columns).toContain("leader");
      expect(result.columns).toContain("party");
      expect(result.columns).toContain("margin");
      expect(result.columns).toContain("colorText");

      expect(result.rowName).toBe("Sao Paulo");
      expect(result.rowOffice).toBe("Governador");
      expect(result.rowLeader).toBe("Candidato A");
      expect(result.rowParty).toBe("PT");
      expect(result.rowLeaderPct).toBe("60,00%");
      expect(result.rowSecondPct).toBe("40,00%");
      expect(result.rowMargin).toBe("20,00 pp");
      expect(result.rowSectionsPct).toBe("100,00%");
      expect(result.rowColorText).toBe("Vermelho");
    } finally {
      await context.close();
    }
  });

  test("TUR-04 bounds certificate in deputy free selection provides [minVotes, maxVotes] and displays uncertainty message", async ({
    browser,
  }) => {
    const { context, page } = await openPage(browser, { viewport: VIEWPORT_1366_768 });
    try {
      const result = await page.evaluate(async () => {
        const { createTerritory } = await import("../../domain/territory.js");
        const { describeElectionCompareSide } = await import("./election-compare-model.js");

        const mun1 = {
          code: "mun1",
          name: "Mun 1",
          totalValidVotes: 5000,
          otherVotes: 500,
          tenthPlaceVotes: 200,
          candidates: [
            { ballotNumber: 10101, name: "Deputado X", party: "PSOL", validVotes: 1000 },
          ],
        };

        const mun2 = {
          code: "mun2",
          name: "Mun 2",
          totalValidVotes: 5000,
          otherVotes: 500,
          tenthPlaceVotes: 200,
          candidates: [
            { ballotNumber: 20202, name: "Deputado Y", party: "NOVO", validVotes: 1000 },
          ],
        };

        const territory = createTerritory({
          municipalities: [
            { code: "mun1", name: "Mun 1", regionCode: "reg1" },
            { code: "mun2", name: "Mun 2", regionCode: "reg1" },
          ],
          regions: [{ code: "reg1", label: "Regiao 1" }],
        });

        const side = describeElectionCompareSide(
          { code: "reg1", name: "Regiao 1" },
          { mun1, mun2 },
          {
            level: "region",
            municipalities: [
              { code: "mun1", name: "Mun 1", regionCode: "reg1" },
              { code: "mun2", name: "Mun 2", regionCode: "reg1" },
            ],
            territory,
            office: "deputado-federal",
            isDeputyFreeSelection: true,
          },
        );

        return {
          uncertainLeader: side.uncertainLeader,
          uncertainMessage: side.uncertainMessage,
          certified: side.boundsCertificate?.certified,
          minVotes: side.boundsCertificate?.bounds.minVotes,
          maxVotes: side.boundsCertificate?.bounds.maxVotes,
        };
      });

      expect(result.uncertainLeader).toBe(true);
      expect(result.certified).toBe(false);
      expect(result.uncertainMessage).toContain("Nao e possivel afirmar o lider");
      expect(result.minVotes).toBe(1000);
      expect(result.maxVotes).toBe(1200);
    } finally {
      await context.close();
    }
  });
});
