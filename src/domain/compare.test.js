import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateIndicator } from "./aggregation.js";
import { classify, computeBreaks } from "./classification.js";
import {
  buildCompareModel,
  describeCompareSide,
  describeDifference,
  formatWithUnit,
  NO_BAND,
  readComparedPair,
  readSelectionComparison,
  swapCompareSides,
} from "./compare.js";
import { INDICATORS } from "./indicator.js";
import { buildPanelUnits } from "./selection.js";
import { SYNTHETIC_INDICATOR } from "./synthetic.js";
import { createTerritory } from "./territory.js";

const ALFA = "3500001";
const BETA = "3500002";
const GAMA = "3500003";
const DELTA = "3500004";
const EPSILON = "3500005";
const ZETA = "3500006";

const REGIONS = [
  { code: "1", label: "RM Alfa" },
  { code: "2", label: "RA Beta" },
  { code: "3", label: "RA Delta" },
];

const RECORDS = [
  { code: ALFA, name: "Alfa", regionCode: "1", population: 300, areaKm2: 10, gdpThousandBrl: 3000 },
  { code: BETA, name: "Beta", regionCode: "2", population: 100, areaKm2: 20, gdpThousandBrl: 1500 },
  { code: GAMA, name: "Gama", regionCode: "2", population: 100, areaKm2: 5, gdpThousandBrl: 500 },
  {
    code: DELTA,
    name: "Delta",
    regionCode: "3",
    population: /** @type {any} */ (null),
    areaKm2: 2,
    gdpThousandBrl: /** @type {any} */ (null),
  },
  {
    code: EPSILON,
    name: "Épsilon",
    regionCode: "1",
    population: 200,
    areaKm2: 10,
    gdpThousandBrl: 2000,
  },
  { code: ZETA, name: "Zeta", regionCode: "1", population: 100, areaKm2: 4, gdpThousandBrl: 800 },
];

const TERRITORY = createTerritory({ municipalities: RECORDS, regions: REGIONS });

/**
 * @param {readonly string[]} codes
 * @param {Partial<import("./compare.js").CompareContext>} [overrides]
 */
function compareCodes(codes, overrides = {}) {
  const pair = readComparedPair(codes, TERRITORY);
  assert.ok(pair, "expected exactly two units");
  return buildCompareModel(pair, {
    records: RECORDS,
    territory: TERRITORY,
    indicator: INDICATORS.population,
    isDemoActive: false,
    level: "municipality",
    ...overrides,
  });
}

/**
 * @param {readonly string[]} codes
 */
function recordsOf(codes) {
  return RECORDS.filter((record) => codes.includes(record.code));
}

test("SEL-11 the comparison needs exactly two panel units, a whole region counting as one", () => {
  assert.equal(readComparedPair([], TERRITORY), null);
  assert.equal(readComparedPair([ALFA], TERRITORY), null);
  assert.equal(readComparedPair([ALFA, BETA, DELTA], TERRITORY), null);

  const municipalities = readComparedPair([ALFA, BETA], TERRITORY);
  assert.deepEqual(
    municipalities?.map((unit) => unit.name),
    ["Alfa", "Beta"],
  );

  const regionAndMunicipality = readComparedPair([BETA, GAMA, ALFA], TERRITORY);
  assert.deepEqual(
    regionAndMunicipality?.map((unit) => [unit.kind, unit.name]),
    [
      ["region", "RA Beta"],
      ["municipality", "Alfa"],
    ],
  );

  const twoRegions = readComparedPair([BETA, GAMA, DELTA], TERRITORY);
  assert.deepEqual(
    twoRegions?.map((unit) => unit.kind),
    ["region", "region"],
  );
});

test("SEL-11 the selection comparison exists only for exactly two panel units", () => {
  const context = {
    records: RECORDS,
    territory: TERRITORY,
    indicator: INDICATORS.population,
    isDemoActive: false,
    level: /** @type {const} */ ("municipality"),
  };

  assert.equal(readSelectionComparison([], context), null);
  assert.equal(readSelectionComparison([ALFA], context), null);
  assert.equal(readSelectionComparison([ALFA, BETA, DELTA], context), null);

  const comparison = readSelectionComparison([ALFA, BETA], context);
  const pair = readComparedPair([ALFA, BETA], TERRITORY);
  assert.ok(pair);
  assert.deepEqual(comparison, buildCompareModel(pair, context));
});

test("SEL-11 the title follows the unit types and A is the first panel row", () => {
  const municipalities = compareCodes([BETA, ALFA]);
  assert.equal(municipalities.title, "Comparativo de Municípios");
  assert.equal(municipalities.countLabel, "2 selecionados");
  const firstRow = buildPanelUnits([BETA, ALFA], TERRITORY)[0];
  assert.deepEqual(municipalities.sides[0].unit, firstRow);

  assert.equal(compareCodes([BETA, GAMA, DELTA]).title, "Comparativo de Regiões");
  assert.equal(compareCodes([BETA, GAMA, ALFA]).title, "Comparativo");
});

test("SEL-11 each side shows its state position, region or count, band and value with unit", () => {
  const model = compareCodes([ALFA, BETA]);
  const [alfa, beta] = model.sides;

  assert.equal(alfa.rankLabel, "#1 no Estado");
  assert.equal(beta.rankLabel, "#3 no Estado", "ties break by name: Beta before Gama");
  assert.equal(alfa.contextLabel, "RM Alfa");
  assert.equal(alfa.valueLabel, formatWithUnit(INDICATORS.population, 300));
  assert.equal(alfa.valueLabel, `${INDICATORS.population.format(300)} habitantes`);

  const breaks = computeBreaks(
    RECORDS.map((record) => record.population),
    "municipality",
  );
  assert.equal(alfa.bandIndex, classify(300, breaks));
  assert.equal(beta.bandIndex, classify(100, breaks));

  const regions = compareCodes([BETA, GAMA, DELTA]);
  assert.equal(regions.sides[0].contextLabel, "2 municípios");
  assert.equal(regions.sides[0].rankLabel, "#2 no Estado");
  assert.equal(regions.sides[1].contextLabel, "1 município");
  assert.equal(regions.sides[1].rankLabel, "Sem posição");
  assert.equal(regions.sides[1].bandIndex, NO_BAND);
  assert.equal(regions.sides[1].valueLabel, "Sem dado");
});

test("SEL-11 a unit is described by the rule of each side, whatever it is paired with", () => {
  const context = {
    records: RECORDS,
    territory: TERRITORY,
    indicator: INDICATORS.population,
    isDemoActive: false,
    level: /** @type {const} */ ("municipality"),
  };
  const [alfa, beta] = buildPanelUnits([ALFA, BETA], TERRITORY);
  const [region] = buildPanelUnits([BETA, GAMA], TERRITORY);

  const pairedWithBeta = compareCodes([ALFA, BETA]);
  assert.deepEqual(describeCompareSide(alfa, context), pairedWithBeta.sides[0]);
  assert.deepEqual(describeCompareSide(beta, context), pairedWithBeta.sides[1]);

  const pairedWithZeta = compareCodes([ZETA, ALFA]);
  assert.deepEqual(describeCompareSide(alfa, context), pairedWithZeta.sides[1]);

  assert.equal(region.kind, "region");
  assert.equal(describeCompareSide(region, context).contextLabel, "2 municípios");
  assert.equal(describeCompareSide(region, context).rankLabel, "#2 no Estado");
});

test("SEL-12 the metrics put population, density, GDP per capita and area side by side", () => {
  const model = compareCodes([BETA, GAMA, ALFA]);
  const expectedIds = ["population", "density", "gdpPerCapita", "area"];
  assert.deepEqual(
    model.metrics.map((metric) => metric.id),
    expectedIds,
  );
  assert.deepEqual(
    model.metrics.map((metric) => metric.label),
    expectedIds.map((id) => INDICATORS[id].label),
  );

  const regionCodes = [BETA, GAMA];
  for (const metric of model.metrics) {
    const indicator = INDICATORS[metric.id];
    const regionValue = aggregateIndicator(indicator, recordsOf(regionCodes)).value;
    const alfaValue = aggregateIndicator(indicator, recordsOf([ALFA])).value;
    assert.equal(metric.values[0].value, regionValue);
    assert.equal(metric.values[1].value, alfaValue);
    assert.equal(metric.values[0].text, indicator.format(regionValue));
  }

  const population = model.metrics[0];
  assert.equal(population.unitLabel, "habitantes");
  assert.equal(population.shareOfFirst, 40);
  assert.equal(model.metrics[2].unitLabel, "", "the GDP format already carries R$");
});

test("SEL-12 the difference names the larger unit, says Iguais or Sem dado", () => {
  const model = compareCodes([ALFA, BETA]);
  assert.equal(model.metrics[0].difference, "+200,0% Alfa");
  assert.equal(model.metrics[3].difference, "+100,0% Beta");

  const tied = compareCodes([BETA, ZETA]);
  assert.equal(tied.metrics[0].difference, "Iguais");

  const missing = compareCodes([ALFA, DELTA]);
  assert.equal(missing.metrics[0].difference, "Sem dado");
  assert.equal(missing.metrics[0].shareOfFirst, null);

  assert.equal(
    describeDifference({ name: "A", value: 163.44 }, { name: "B", value: 100 }),
    "+63,4% A",
  );
  assert.equal(describeDifference({ name: "A", value: 0 }, { name: "B", value: 5 }), "Sem dado");
  assert.equal(describeDifference({ name: "A", value: 0 }, { name: "B", value: 0 }), "Iguais");
});

test("SEL-12 with the demo on only the synthetic value is compared", () => {
  const syntheticRecords = RECORDS.map((record, index) => ({ ...record, value: index * 10 }));
  const syntheticIndicator = {
    ...SYNTHETIC_INDICATOR,
    computeValue: (/** @type {any} */ record) => record.value ?? null,
  };
  const model = compareCodes([BETA, EPSILON], {
    records: syntheticRecords,
    indicator: syntheticIndicator,
    isDemoActive: true,
  });

  assert.equal(model.metrics.length, 1);
  const [metric] = model.metrics;
  assert.equal(metric.id, SYNTHETIC_INDICATOR.id);
  assert.equal(metric.label, SYNTHETIC_INDICATOR.label);
  assert.equal(metric.values[0].value, 10);
  assert.equal(metric.values[1].value, 40);
  assert.equal(metric.difference, "+300,0% Épsilon");
  assert.equal(model.sides[1].valueLabel, `${SYNTHETIC_INDICATOR.format(40)} unidades`);
});

test("SEL-13 swapping the sides keeps the pair and the differences", () => {
  const model = compareCodes([BETA, GAMA, ALFA]);
  const swapped = swapCompareSides(model);

  assert.equal(swapped.pairKey, model.pairKey);
  assert.deepEqual(swapped.sides, [model.sides[1], model.sides[0]]);
  for (let index = 0; index < model.metrics.length; index += 1) {
    assert.deepEqual(swapped.metrics[index].values, [
      model.metrics[index].values[1],
      model.metrics[index].values[0],
    ]);
    assert.equal(swapped.metrics[index].difference, model.metrics[index].difference);
  }
  assert.equal(swapped.metrics[0].shareOfFirst, 60);
});

test("RGV-03 and RGV-04 compare two government regions with custom title and RM São Paulo context label", () => {
  const govTerritory = createTerritory({
    municipalities: [
      {
        code: "101",
        name: "Capital",
        regionCode: "1",
        governmentRegionCode: "rg-40",
        governmentRegionName: "RG de São Paulo",
        population: 12000000,
        areaKm2: 1500,
        gdpThousandBrl: 800000000,
      },
      {
        code: "102",
        name: "Campinas",
        regionCode: "6",
        governmentRegionCode: "rg-11",
        governmentRegionName: "RG de Campinas",
        population: 1200000,
        areaKm2: 800,
        gdpThousandBrl: 70000000,
      },
    ],
    regions: [
      { code: "1", label: "RM São Paulo" },
      { code: "6", label: "RA Campinas" },
    ],
    governmentRegions: [
      { code: "rg-40", label: "RG de São Paulo" },
      { code: "rg-11", label: "RG de Campinas" },
    ],
  });

  const pair = [
    {
      kind: /** @type {const} */ ("governmentRegion"),
      code: "rg-40",
      name: "RG de São Paulo",
      codes: ["101"],
    },
    {
      kind: /** @type {const} */ ("governmentRegion"),
      code: "rg-11",
      name: "RG de Campinas",
      codes: ["102"],
    },
  ];

  const model = buildCompareModel(pair, {
    records: [
      {
        code: "101",
        name: "Capital",
        regionCode: "1",
        governmentRegionCode: "rg-40",
        governmentRegionName: "RG de São Paulo",
        population: 12000000,
        areaKm2: 1500,
        gdpThousandBrl: 800000000,
      },
      {
        code: "102",
        name: "Campinas",
        regionCode: "6",
        governmentRegionCode: "rg-11",
        governmentRegionName: "RG de Campinas",
        population: 1200000,
        areaKm2: 800,
        gdpThousandBrl: 70000000,
      },
    ],
    territory: govTerritory,
    indicator: INDICATORS.population,
    isDemoActive: false,
    level: /** @type {any} */ ("governmentRegion"),
  });

  assert.equal(model.title, "Comparativo de Regiões de Governo");
  assert.equal(model.sides[0].contextLabel, "igual à região administrativa");
  assert.equal(model.sides[1].contextLabel, "1 município");
});
