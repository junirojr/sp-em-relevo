import assert from "node:assert/strict";
import test from "node:test";
import {
  computeIndicatorValues,
  DEFAULT_INDICATOR_ID,
  findIndicator,
  INDICATORS,
} from "./indicator.js";

test("IND-03 catalog declares four indicators with mandatory fields", () => {
  const ids = Object.keys(INDICATORS);
  assert.deepEqual(ids, ["population", "area", "density", "gdpPerCapita"]);

  for (const id of ids) {
    const ind = INDICATORS[id];
    assert.equal(ind.id, id);
    assert.ok(typeof ind.label === "string" && ind.label.length > 0);
    assert.ok(typeof ind.unit === "string" && ind.unit.length > 0);
    assert.ok(typeof ind.year === "string" && ind.year.length > 0);
    assert.ok(typeof ind.source === "string" && ind.source.length > 0);
    assert.ok(ind.sourceUrl.startsWith("https://sidra.ibge.gov.br/tabela/"));
    assert.ok(typeof ind.format === "function");
    assert.ok(typeof ind.formatAbbreviated === "function");
    assert.ok(ind.aggregation);
  }
});

const MUNICIPALITY_RECORD_FIELDS = [
  "code",
  "name",
  "regionCode",
  "population",
  "areaKm2",
  "gdpThousandBrl",
];

const SINGLE_MUNICIPALITIES = [
  { population: 11451999, areaKm2: 1521.11, gdpThousandBrl: 828980607 },
  { population: 1139047, areaKm2: 794.571, gdpThousandBrl: 72946774 },
  { population: 5000, areaKm2: 12.5, gdpThousandBrl: 1234 },
];

/**
 * @param {Array<Record<string, number>>} municipalities
 * @param {string} field
 * @returns {number}
 */
function sumField(municipalities, field) {
  let total = 0;
  for (const municipality of municipalities) {
    total += municipality[field];
  }
  return total;
}

/**
 * @param {import("./indicator.js").Aggregation} aggregation
 * @param {Array<Record<string, number>>} municipalities
 * @returns {number}
 */
function applyAggregation(aggregation, municipalities) {
  if (aggregation.type === "sum") {
    return sumField(municipalities, aggregation.field);
  }
  const numerator = sumField(municipalities, aggregation.numerator) * aggregation.numeratorScale;
  return numerator / sumField(municipalities, aggregation.denominator);
}

/**
 * @param {import("./indicator.js").Aggregation} aggregation
 * @returns {string[]}
 */
function aggregationFields(aggregation) {
  if (aggregation.type === "sum") {
    return [aggregation.field];
  }
  return [aggregation.numerator, aggregation.denominator];
}

test("DAD-07 aggregation descriptors name only fields of the municipality record", () => {
  for (const indicator of Object.values(INDICATORS)) {
    for (const field of aggregationFields(indicator.aggregation)) {
      assert.ok(MUNICIPALITY_RECORD_FIELDS.includes(field), `${indicator.id}: ${field}`);
    }
  }
});

test("DAD-07 aggregation descriptor on a single municipality equals computeValue", () => {
  for (const indicator of Object.values(INDICATORS)) {
    for (const municipality of SINGLE_MUNICIPALITIES) {
      const aggregated = applyAggregation(indicator.aggregation, [municipality]);
      const computed = indicator.computeValue(municipality);
      assert.notEqual(computed, null);
      assert.ok(Math.abs(aggregated - Number(computed)) < 1e-6, indicator.id);
    }
  }
});

test("DAD-07 gdpPerCapita descriptor scales thousands of reais to reais", () => {
  const aggregation = INDICATORS.gdpPerCapita.aggregation;
  assert.equal(aggregation.type, "ratio");
  if (aggregation.type !== "ratio") {
    return;
  }
  assert.equal(aggregation.numerator, "gdpThousandBrl");
  assert.equal(aggregation.numeratorScale, 1000);
});

test("IND-05 gdpPerCapita year description matches required text", () => {
  const gdp = INDICATORS.gdpPerCapita;
  assert.equal(gdp.yearDescription, "PIB 2023 / população 2022");
});

test("IND-03 findIndicator finds existing indicator or falls back to default", () => {
  assert.equal(findIndicator("population").id, "population");
  assert.equal(findIndicator("density").id, "density");
  assert.equal(findIndicator("invalid-id").id, DEFAULT_INDICATOR_ID);
  assert.equal(findIndicator(null).id, DEFAULT_INDICATOR_ID);
});

test("BAS-12 and DAD-07 computeIndicatorValues returns Float64Array with calculated values", () => {
  const sampleMunicipalities = [
    {
      code: "3550308",
      name: "São Paulo",
      population: 11451999,
      areaKm2: 1521.11,
      gdpThousandBrl: 828980607,
    },
    {
      code: "3509502",
      name: "Campinas",
      population: 1139047,
      areaKm2: 794.571,
      gdpThousandBrl: 72946774,
    },
    {
      code: "3500000",
      name: "Sem Dados",
      population: null,
      areaKm2: null,
      gdpThousandBrl: null,
    },
  ];

  const popValues = computeIndicatorValues(INDICATORS.population, sampleMunicipalities);
  assert.ok(popValues instanceof Float64Array);
  assert.equal(popValues[0], 11451999);
  assert.equal(popValues[1], 1139047);
  assert.ok(Number.isNaN(popValues[2]));

  const areaValues = computeIndicatorValues(INDICATORS.area, sampleMunicipalities);
  assert.ok(areaValues instanceof Float64Array);
  assert.equal(areaValues[0], 1521.11);
  assert.equal(areaValues[1], 794.571);
  assert.ok(Number.isNaN(areaValues[2]));

  const densityValues = computeIndicatorValues(INDICATORS.density, sampleMunicipalities);
  assert.ok(densityValues instanceof Float64Array);
  const expectedDensitySp = 11451999 / 1521.11;
  assert.ok(Math.abs(densityValues[0] - expectedDensitySp) < 1e-6);
  assert.ok(Number.isNaN(densityValues[2]));

  const gdpValues = computeIndicatorValues(INDICATORS.gdpPerCapita, sampleMunicipalities);
  assert.ok(gdpValues instanceof Float64Array);
  const expectedGdpSp = (828980607 * 1000) / 11451999;
  assert.ok(Math.abs(gdpValues[0] - expectedGdpSp) < 1e-4);
  assert.ok(Number.isNaN(gdpValues[2]));
});
