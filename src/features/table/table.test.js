import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDICATORS } from "../../domain/indicator.js";
import {
  buildTableCaption,
  buildTableColumns,
  buildTableModel,
  buildTableRows,
  formatMarginPoints,
  formatPercentage,
  resolveColorText,
  resolveLevelLabel,
  resolveRoundLabel,
  resolveThemeLabel,
  WCAG_FOOTER_BADGE,
} from "./table-model.js";
import {
  closeTable,
  createTableState,
  openTable,
  reduceTable,
  TABLE_CLOSE,
  TABLE_OPEN,
} from "./table-slice.js";

const MOCK_MUNICIPALITIES = [
  {
    code: "3550308",
    name: "São Paulo",
    regionCode: "1",
    governmentRegionCode: "rg-40",
    governmentRegionName: "RG de São Paulo",
    population: 11451245,
    areaKm2: 1521.1,
    gdpThousandBrl: 828980608,
  },
  {
    code: "3509502",
    name: "Campinas",
    regionCode: "6",
    governmentRegionCode: "rg-11",
    governmentRegionName: "RG de Campinas",
    population: 1139047,
    areaKm2: 795.7,
    gdpThousandBrl: 72946774,
  },
  {
    code: "3549904",
    name: "São José dos Campos",
    regionCode: "4",
    governmentRegionCode: "rg-38",
    governmentRegionName: "RG de São José dos Campos",
    population: 697054,
    areaKm2: 1099.4,
    gdpThousandBrl: 39515000,
  },
];

const MOCK_REGIONS = [
  { code: "1", label: "RM São Paulo" },
  { code: "4", label: "RA São José dos Campos" },
  { code: "6", label: "RA Campinas" },
];

const MOCK_GOV_REGIONS = [
  { code: "rg-11", label: "RG de Campinas" },
  { code: "rg-38", label: "RG de São José dos Campos" },
  { code: "rg-40", label: "RG de São Paulo" },
];

describe("Table Feature Unit Tests (ACE-02, ACE-03, ACE-04, ACE-06)", () => {
  it("ACE-02 buildTableColumns produces correct columns for indicator mode across territorial levels", () => {
    const munColumns = buildTableColumns({
      mode: "indicators",
      level: "municipality",
      indicator: INDICATORS.population,
    });
    const munKeys = munColumns.map((col) => col.key);
    assert.deepEqual(munKeys, [
      "selection",
      "code",
      "name",
      "value",
      "classIndex",
      "region",
      "actions",
    ]);

    const govColumns = buildTableColumns({
      mode: "indicators",
      level: "governmentRegion",
      indicator: INDICATORS.area,
    });
    const govKeys = govColumns.map((col) => col.key);
    assert.deepEqual(govKeys, ["selection", "code", "name", "value", "count", "actions"]);

    const regColumns = buildTableColumns({
      mode: "indicators",
      level: "region",
      indicator: INDICATORS.density,
    });
    const regKeys = regColumns.map((col) => col.key);
    assert.deepEqual(regKeys, ["selection", "code", "name", "value", "count", "actions"]);
  });

  it("ACE-02 buildTableColumns produces correct columns for election mode", () => {
    const electionColumns = buildTableColumns({
      mode: "second-round",
      level: "municipality",
    });
    const electionKeys = electionColumns.map((col) => col.key);
    assert.deepEqual(electionKeys, [
      "selection",
      "code",
      "name",
      "leader",
      "party",
      "leaderPct",
      "secondPct",
      "margin",
      "sectionsPct",
      "colorText",
      "actions",
    ]);
  });

  it("ACE-03 buildTableCaption summarizes indicator, territorial level, units count and theme", () => {
    const captionMun = buildTableCaption({
      mode: "indicators",
      level: "municipality",
      indicator: INDICATORS.population,
      totalUnits: 645,
      theme: "dark",
    });
    assert.equal(
      captionMun,
      "Tabela de dados do mapa. Indicador: População. Nível territorial: Município. 645 unidades listadas. Tema: escuro.",
    );

    const captionElec = buildTableCaption({
      mode: "second-round",
      level: "region",
      totalUnits: 16,
      theme: "light",
    });
    assert.equal(
      captionElec,
      "Tabela de dados eleitorais. Turno: 2º turno (Presidente). Nível territorial: Região administrativa. 16 unidades listadas. Tema: claro.",
    );

    // Invariant: no en-dash (U+2013) or em-dash (U+2014) allowed
    assert.equal(captionMun.includes("\u2013"), false);
    assert.equal(captionMun.includes("\u2014"), false);
    assert.equal(captionElec.includes("\u2013"), false);
    assert.equal(captionElec.includes("\u2014"), false);
  });

  it("ACE-02 resolveColorText maps political parties and statuses to Portuguese color descriptions", () => {
    assert.equal(resolveColorText("PT"), "Vermelho");
    assert.equal(resolveColorText("PL"), "Azul escuro");
    assert.equal(resolveColorText("REPUBLICANOS"), "Azul");
    assert.equal(resolveColorText("PSB"), "Amarelo");
    assert.equal(resolveColorText("MDB"), "Verde");
    assert.equal(resolveColorText("PSDB"), "Azul clássico");
    assert.equal(resolveColorText("", "no-result"), "Cinza sem dado");
    assert.equal(resolveColorText("", "tie"), "Cinza empate");
    assert.equal(resolveColorText("", "insufficient-sections"), "Cinza em apuração");
    assert.equal(resolveColorText("UNKNOWN_PARTY"), "Cor partidária (UNKNOWN_PARTY)");
  });

  it("ACE-02 buildTableRows generates deterministic rows matching inspect() values at municipality level", () => {
    const rows = buildTableRows({
      mode: "indicators",
      level: "municipality",
      indicator: INDICATORS.population,
      municipalities: MOCK_MUNICIPALITIES,
      regions: MOCK_REGIONS,
      governmentRegions: MOCK_GOV_REGIONS,
      breaks: [500000, 1000000],
      selectedCodes: ["3550308"],
      pointedCode: "3509502",
      inspectedCode: "3549904",
    });

    assert.equal(rows.length, 3);

    // Deterministic ordering: sorted by code ascending
    assert.equal(rows[0].code, "3509502");
    assert.equal(rows[0].name, "Campinas");
    assert.equal(rows[0].isSelected, false);
    assert.equal(rows[0].isPointed, true);
    assert.equal(rows[0].isInspected, false);
    assert.equal(rows[0].formattedValue, "1.139.047");
    assert.equal(rows[0].regionName, "RA Campinas");
    assert.equal(rows[0].govRegionName, "RG de Campinas");

    assert.equal(rows[1].code, "3549904");
    assert.equal(rows[1].name, "São José dos Campos");
    assert.equal(rows[1].isSelected, false);
    assert.equal(rows[1].isPointed, false);
    assert.equal(rows[1].isInspected, true);

    assert.equal(rows[2].code, "3550308");
    assert.equal(rows[2].name, "São Paulo");
    assert.equal(rows[2].isSelected, true);
    assert.equal(rows[2].isPointed, false);
    assert.equal(rows[2].isInspected, false);
    assert.equal(rows[2].formattedValue, "11.451.245");
  });

  it("ACE-02 buildTableRows computes aggregated values for governmentRegion and region levels", () => {
    const govRows = buildTableRows({
      mode: "indicators",
      level: "governmentRegion",
      indicator: INDICATORS.population,
      municipalities: MOCK_MUNICIPALITIES,
      governmentRegions: MOCK_GOV_REGIONS,
      selectedCodes: ["rg-40"],
    });

    assert.equal(govRows.length, 3);
    assert.equal(govRows[0].code, "rg-11");
    assert.equal(govRows[0].count, 1);
    assert.equal(govRows[0].formattedValue, "1.139.047");

    assert.equal(govRows[2].code, "rg-40");
    assert.equal(govRows[2].name, "RG de São Paulo");
    assert.equal(govRows[2].isSelected, true);
    assert.equal(govRows[2].formattedValue, "11.451.245");

    const regRows = buildTableRows({
      mode: "indicators",
      level: "region",
      indicator: INDICATORS.population,
      municipalities: MOCK_MUNICIPALITIES,
      regions: MOCK_REGIONS,
      selectedCodes: ["1"],
    });

    assert.equal(regRows.length, 3);
    assert.equal(regRows[0].code, "1");
    assert.equal(regRows[0].name, "RM São Paulo");
    assert.equal(regRows[0].isSelected, true);
    assert.equal(regRows[0].formattedValue, "11.451.245");
  });

  it("ACE-02 buildTableRows formats election data with leader, margin, sections, and color in text", () => {
    const mockElectionUnits = [
      {
        code: "3550308",
        name: "São Paulo",
        validVotes: 100000,
        sectionsCounted: 100,
        sectionsTotal: 100,
        candidates: [
          { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 60000 },
          { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 40000 },
        ],
      },
      {
        code: "3509502",
        name: "Campinas",
        validVotes: 50000,
        sectionsCounted: 50,
        sectionsTotal: 50,
        candidates: [
          { ballotNumber: 22, name: "Candidato B", party: "PL", validVotes: 30000 },
          { ballotNumber: 13, name: "Candidato A", party: "PT", validVotes: 20000 },
        ],
      },
    ];

    const rows = buildTableRows({
      mode: "second-round",
      level: "municipality",
      municipalities: MOCK_MUNICIPALITIES.slice(0, 2),
      electionUnits: mockElectionUnits,
    });

    assert.equal(rows.length, 2);

    // Campinas (3509502)
    assert.equal(rows[0].code, "3509502");
    assert.equal(rows[0].leader, "Candidato B");
    assert.equal(rows[0].party, "PL");
    assert.equal(rows[0].leaderPct, "60,00%");
    assert.equal(rows[0].secondPct, "40,00%");
    assert.equal(rows[0].margin, "20,00 pp");
    assert.equal(rows[0].colorText, "Azul escuro");

    // São Paulo (3550308)
    assert.equal(rows[1].code, "3550308");
    assert.equal(rows[1].leader, "Candidato A");
    assert.equal(rows[1].party, "PT");
    assert.equal(rows[1].leaderPct, "60,00%");
    assert.equal(rows[1].secondPct, "40,00%");
    assert.equal(rows[1].margin, "20,00 pp");
    assert.equal(rows[1].colorText, "Vermelho");
  });

  it("ACE-04 formatPercentage and formatMarginPoints handle invalid or boundary values gracefully", () => {
    assert.equal(formatPercentage(null), "-");
    assert.equal(formatPercentage(undefined), "-");
    assert.equal(formatPercentage(Number.NaN), "-");
    assert.equal(formatPercentage(55.234), "55,23%");

    assert.equal(formatMarginPoints(null), "-");
    assert.equal(formatMarginPoints(undefined), "-");
    assert.equal(formatMarginPoints(Number.NaN), "-");
    assert.equal(formatMarginPoints(10.5), "10,50 pp");
  });

  it("ACE-06 buildTableModel produces model with WCAG footer badge and correct counts", () => {
    const model = buildTableModel({
      mode: "indicators",
      level: "municipality",
      indicator: INDICATORS.population,
      municipalities: MOCK_MUNICIPALITIES,
      regions: MOCK_REGIONS,
      governmentRegions: MOCK_GOV_REGIONS,
      selectedCodes: ["3550308"],
    });

    assert.equal(model.footerText, WCAG_FOOTER_BADGE);
    assert.equal(model.footerText, "projetado para WCAG 2.2 AA");
    assert.equal(model.totalCount, 3);
    assert.equal(model.selectedCount, 1);
    assert.equal(model.rows.length, 3);
  });

  it("table-slice reducer manages open and close state properly", () => {
    const initialState = createTableState();
    assert.equal(initialState.isOpen, false);

    const openState = reduceTable(initialState, openTable());
    assert.equal(openState.isOpen, true);

    const closedState = reduceTable(openState, closeTable());
    assert.equal(closedState.isOpen, false);

    const unchangedState = reduceTable(closedState, { type: "unknown" });
    assert.equal(unchangedState.isOpen, false);
  });
});
