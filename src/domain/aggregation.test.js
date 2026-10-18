import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  aggregateIndicator,
  aggregateVectorByIndexes,
  formatAggregatedValue,
  readAggregationLabel,
} from "./aggregation.js";
import { INDICATORS } from "./indicator.js";

const FIXTURE_PATH = "src/domain/fixtures/region-reference.json";
const DATA_MUNICIPALITIES_PATH = "data/municipalities.json";

/**
 * Synthetic municipalities where the average of ratios differs from the ratio of sums:
 * City A: pop = 100, area = 10 -> density = 10
 * City B: pop = 1000, area = 500 -> density = 2
 * Average of densities = (10 + 2) / 2 = 6
 * Ratio of sums = 1100 / 510 = 2.15686...
 */
function createRatioFixture() {
  return [
    {
      code: "1",
      name: "Alpha",
      regionCode: "10",
      population: 100,
      areaKm2: 10,
      gdpThousandBrl: 500,
    },
    {
      code: "2",
      name: "Beta",
      regionCode: "10",
      population: 1000,
      areaKm2: 500,
      gdpThousandBrl: 2000,
    },
  ];
}

test("NIV-02 population and area of a region are the sum of its municipalities", () => {
  const municipalities = createRatioFixture();
  const popResult = aggregateIndicator(INDICATORS.population, municipalities);
  assert.equal(popResult.value, 1100);
  assert.equal(popResult.note, null);
  assert.equal(popResult.completeness.isComplete, true);

  const areaResult = aggregateIndicator(INDICATORS.area, municipalities);
  assert.equal(areaResult.value, 510);
  assert.equal(areaResult.note, null);
  assert.equal(areaResult.completeness.isComplete, true);
});

test("NIV-03 region density is sum of population over sum of area, not average of densities", () => {
  const municipalities = createRatioFixture();
  const densityResult = aggregateIndicator(INDICATORS.density, municipalities);
  const expectedDensity = 1100 / 510;
  assert.ok(densityResult.value !== null);
  assert.ok(Math.abs(densityResult.value - expectedDensity) < 1e-9);

  // Average of individual densities is 6; ratio of sums is ~2.15686
  assert.ok(Math.abs(densityResult.value - 6) > 1);
});

test("NIV-03 region GDP per capita is sum of GDP over sum of population, not average of GDPs", () => {
  const municipalities = createRatioFixture();
  const gdpResult = aggregateIndicator(INDICATORS.gdpPerCapita, municipalities);
  // (500 + 2000) * 1000 / (100 + 1000) = 2,500,000 / 1100 = 2272.7272...
  const expectedGdpPerCapita = 2500000 / 1100;
  assert.ok(gdpResult.value !== null);
  assert.ok(Math.abs(gdpResult.value - expectedGdpPerCapita) < 1e-9);
});

test("NIV-04 municipality missing a ratio term is excluded from both numerator and denominator", () => {
  const municipalities = [
    { code: "1", name: "A", regionCode: "1", population: 100, areaKm2: 10, gdpThousandBrl: 50 },
    // Missing area -> must not contribute pop or area to density
    { code: "2", name: "B", regionCode: "1", population: 500, areaKm2: null, gdpThousandBrl: 100 },
    // Missing pop -> must not contribute pop or area to density
    { code: "3", name: "C", regionCode: "1", population: null, areaKm2: 20, gdpThousandBrl: 200 },
  ];

  const densityResult = aggregateIndicator(INDICATORS.density, municipalities);
  assert.equal(densityResult.value, 10); // 100 / 10
  assert.equal(densityResult.completeness.complete, 1);
  assert.equal(densityResult.completeness.total, 3);
  assert.equal(densityResult.completeness.isComplete, false);
  assert.equal(densityResult.note, "dado incompleto (1 de 3)");
});

test("NIV-04 incomplete region reports 'dado incompleto (N de M)' and never 0", () => {
  const municipalities = [
    { code: "1", name: "A", regionCode: "1", population: 200, areaKm2: 20, gdpThousandBrl: null },
    { code: "2", name: "B", regionCode: "1", population: 300, areaKm2: 30, gdpThousandBrl: 600 },
  ];

  const sumResult = aggregateIndicator(INDICATORS.population, municipalities);
  assert.equal(sumResult.note, null);

  const gdpResult = aggregateIndicator(INDICATORS.gdpPerCapita, municipalities);
  assert.equal(gdpResult.completeness.complete, 1);
  assert.equal(gdpResult.completeness.total, 2);
  assert.equal(gdpResult.note, "dado incompleto (1 de 2)");
  assert.ok(gdpResult.value !== 0);
  assert.equal(gdpResult.value, (600 * 1000) / 300);
});

test("NIV-04 zero denominator or all missing yields 'sem dado' and value null, never 0", () => {
  const municipalitiesZeroArea = [
    { code: "1", name: "A", regionCode: "1", population: 100, areaKm2: 0, gdpThousandBrl: 10 },
  ];
  const zeroResult = aggregateIndicator(INDICATORS.density, municipalitiesZeroArea);
  assert.equal(zeroResult.value, null);
  assert.equal(zeroResult.note, "sem dado");
  assert.equal(formatAggregatedValue(zeroResult, INDICATORS.density), "sem dado");

  const municipalitiesMissing = [
    {
      code: "1",
      name: "A",
      regionCode: "1",
      population: null,
      areaKm2: null,
      gdpThousandBrl: null,
    },
  ];
  const missingResult = aggregateIndicator(INDICATORS.population, municipalitiesMissing);
  assert.equal(missingResult.value, null);
  assert.equal(missingResult.note, "sem dado");
  assert.equal(formatAggregatedValue(missingResult, INDICATORS.population), "sem dado");
});

/**
 * @param {any} doc
 * @returns {any[]}
 */
function parseMunicipalities(doc) {
  if (Array.isArray(doc.municipalities)) {
    return doc.municipalities;
  }
  const columns = doc.columns;
  const rows = doc.rows;
  const result = [];
  for (const row of rows) {
    /** @type {Record<string, any>} */
    const record = {};
    for (let i = 0; i < columns.length; i += 1) {
      record[columns[i]] = row[i];
    }
    result.push(record);
  }
  return result;
}

test("NIV-05 aggregates match region-reference.json exactly or within 1e-9 relative error on real data", () => {
  const rawMunicipalities = JSON.parse(fs.readFileSync(DATA_MUNICIPALITIES_PATH, "utf8"));
  const municipalities = parseMunicipalities(rawMunicipalities);
  const rawReference = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

  for (const ref of rawReference.regions) {
    const regionMunicipalities = municipalities.filter(
      (/** @type {any} */ m) => String(m.regionCode) === String(ref.code),
    );
    assert.ok(regionMunicipalities.length > 0);

    const pop = aggregateIndicator(INDICATORS.population, regionMunicipalities);
    assert.equal(pop.value, ref.population);

    const area = aggregateIndicator(INDICATORS.area, regionMunicipalities);
    assert.ok(area.value !== null);
    assert.ok(Math.abs(area.value - ref.areaKm2) < 1e-9);

    const density = aggregateIndicator(INDICATORS.density, regionMunicipalities);
    assert.ok(density.value !== null);
    const densityRelError = Math.abs(density.value - ref.density) / ref.density;
    assert.ok(densityRelError <= 1e-9);

    const gdp = aggregateIndicator(INDICATORS.gdpPerCapita, regionMunicipalities);
    assert.ok(gdp.value !== null);
    const gdpRelError = Math.abs(gdp.value - ref.gdpPerCapita) / ref.gdpPerCapita;
    assert.ok(gdpRelError <= 1e-9);
  }
});

test("SEL-07 sum indicators use label 'Total' and ratio indicators use '<indicador> do conjunto'", () => {
  assert.equal(readAggregationLabel(INDICATORS.population), "Total");
  assert.equal(readAggregationLabel(INDICATORS.area), "Total");
  assert.equal(readAggregationLabel(INDICATORS.density), "Densidade demográfica do conjunto");
  assert.equal(readAggregationLabel(INDICATORS.gdpPerCapita), "PIB per capita do conjunto");
});

test("DEM-03 aggregateVectorByIndexes sums synthetic values across specified indexes", () => {
  const vector = new Float64Array([10.5, 20.25, 30.0, 40.5]);
  const sum = aggregateVectorByIndexes(vector, [0, 2, 3]);
  assert.equal(sum, 81.0);

  const emptySum = aggregateVectorByIndexes(vector, []);
  assert.equal(emptySum, 0);
});
