import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { aggregateIndicator } from "./aggregation.js";
import {
  classify,
  computeBreaks,
  computeGeometricBreaks,
  computeQuantileBreaks,
  HEAT_BAND_COUNT,
  REGION_BAND_SIZES,
  readLogPosition,
  roundSignificant,
} from "./classification.js";
import { INDICATORS } from "./indicator.js";

test("ESC-01 roundSignificant rounds positive numbers to 2 or 3 significant digits", () => {
  assert.equal(roundSignificant(3495.45, 2), 3500);
  assert.equal(roundSignificant(0.00542, 2), 0.0054);
  assert.equal(roundSignificant(52.602, 3), 52.6);
  assert.equal(roundSignificant(53190.2, 3), 53200);
});

test("ESC-01 municipality geometric breaks produce 6 strictly increasing breaks", () => {
  const breaks = computeGeometricBreaks(100, 1000000, HEAT_BAND_COUNT);
  assert.equal(breaks.length, 6);
  for (let i = 1; i < breaks.length; i += 1) {
    assert.ok(breaks[i] > breaks[i - 1]);
  }
});

test("ESC-01 region quantile breaks follow the [2, 3, 2, 2, 2, 3, 2] partition with geometric midpoints", () => {
  const values = [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140];
  const breaks = computeQuantileBreaks(values, REGION_BAND_SIZES);
  assert.equal(breaks.length, 6);
  for (let i = 1; i < breaks.length; i += 1) {
    assert.ok(breaks[i] > breaks[i - 1]);
  }
});

test("ESC-02 value equal to break falls into upper band, value just below falls into lower band", () => {
  const breaks = [10, 20, 30, 40, 50, 60];
  assert.equal(classify(5, breaks), 0);
  assert.equal(classify(10, breaks), 1);
  assert.equal(classify(10 * (1 - 1e-12), breaks), 0);
  assert.equal(classify(20, breaks), 2);
  assert.equal(classify(20 * (1 - 1e-12), breaks), 1);
  assert.equal(classify(60, breaks), 6);
  assert.equal(classify(60 * (1 - 1e-12), breaks), 5);
  assert.equal(classify(100, breaks), 6);
});

test("ESC-03 classify is pure and monotonic in 10000 random pairs with a < b", () => {
  const breaks = [10, 25, 60, 150, 400, 1000];
  let seed = 42;
  function random() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  for (let i = 0; i < 10000; i += 1) {
    const val1 = random() * 2000;
    const val2 = random() * 2000;
    const a = Math.min(val1, val2);
    const b = Math.max(val1, val2);
    const classA = classify(a, breaks);
    const classB = classify(b, breaks);
    assert.ok(classA <= classB, `classify(${a})=${classA} must be <= classify(${b})=${classB}`);
  }
});

test("ESC-04 none of the 7 bands is empty across all 8 pairs on real data", () => {
  const munJson = JSON.parse(fs.readFileSync("data/municipalities.json", "utf8"));
  const regJson = JSON.parse(fs.readFileSync("data/regions.json", "utf8"));
  const municipalities = munJson.municipalities;
  const regions = regJson.regions;

  const indicatorList = Object.values(INDICATORS);
  assert.equal(indicatorList.length, 4);

  for (const indicator of indicatorList) {
    // 1. Municipality level
    const munValues = municipalities
      .map((/** @type {any} */ m) => indicator.computeValue(m))
      .filter((/** @type {any} */ v) => v !== null && v > 0);
    const munBreaks = computeBreaks(munValues, "municipality");
    assert.equal(munBreaks.length, 6);

    const munBandCounts = new Array(HEAT_BAND_COUNT).fill(0);
    for (const val of munValues) {
      const band = classify(val, munBreaks);
      munBandCounts[band] += 1;
    }
    for (let b = 0; b < HEAT_BAND_COUNT; b += 1) {
      assert.ok(
        munBandCounts[b] > 0,
        `Municipality band ${b} is empty for indicator ${indicator.id}`,
      );
    }

    // 2. Region level
    const regValues = regions
      .map((/** @type {any} */ reg) => {
        const inRegion = municipalities.filter((/** @type {any} */ m) => m.regionCode === reg.code);
        return aggregateIndicator(indicator, inRegion).value;
      })
      .filter((/** @type {any} */ v) => v !== null && v > 0);
    assert.equal(regValues.length, 16);

    const regBreaks = computeBreaks(regValues, "region");
    assert.equal(regBreaks.length, 6);

    const regBandCounts = new Array(HEAT_BAND_COUNT).fill(0);
    for (const val of regValues) {
      const band = classify(val, regBreaks);
      regBandCounts[band] += 1;
    }
    for (let b = 0; b < HEAT_BAND_COUNT; b += 1) {
      assert.ok(regBandCounts[b] > 0, `Region band ${b} is empty for indicator ${indicator.id}`);
    }
    assert.deepEqual(regBandCounts, REGION_BAND_SIZES);
  }
});

test("ESC-06 readLogPosition maps values logarithmically between 0 and 1", () => {
  const min = 10;
  const max = 1000;
  assert.equal(readLogPosition(10, min, max), 0);
  assert.equal(readLogPosition(1000, min, max), 1);
  assert.ok(Math.abs(readLogPosition(100, min, max) - 0.5) < 1e-12);
  assert.equal(readLogPosition(5, min, max), 0);
  assert.equal(readLogPosition(2000, min, max), 1);
});
