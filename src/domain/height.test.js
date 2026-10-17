import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { aggregateIndicator } from "./aggregation.js";
import { classify, computeBreaks } from "./classification.js";
import {
  BASE_HEIGHT,
  computeHeightTargets,
  computeStepHeight,
  computeStepHeightTargets,
  computeTargetHeight,
  DEFAULT_HEIGHT_GAIN,
  findPositiveBounds,
} from "./height.js";
import { INDICATORS } from "./indicator.js";

test("ESC-06 findPositiveBounds returns positive min and max from values", () => {
  const values = [0, -5, null, 10, 500, 20];
  const bounds = findPositiveBounds(values);
  assert.equal(bounds.min, 10);
  assert.equal(bounds.max, 500);
});

test("ESC-06 computeTargetHeight returns 1 for flat height mode", () => {
  const height = computeTargetHeight(100, 10, 1000, { heightMode: "flat" });
  assert.equal(height, BASE_HEIGHT);
});

test("ESC-06 computeTargetHeight returns 1 for non-positive or absent values", () => {
  assert.equal(computeTargetHeight(0, 10, 1000), BASE_HEIGHT);
  assert.equal(computeTargetHeight(-10, 10, 1000), BASE_HEIGHT);
  assert.equal(computeTargetHeight(null, 10, 1000), BASE_HEIGHT);
});

test("ESC-06 computeTargetHeight scales proportionally with log position and exaggeration", () => {
  const min = 10;
  const max = 1000;
  const minHeight = computeTargetHeight(min, min, max, { exaggeration: 0.5 });
  assert.equal(minHeight, 1);

  const midHeight = computeTargetHeight(100, min, max, { exaggeration: 0.5 });
  // logPosition = 0.5, gain = 9, exaggeration = 0.5 => 1 + 9 * 0.5 * 0.5 = 3.25
  assert.ok(Math.abs(midHeight - 3.25) < 1e-12);

  const maxHeight = computeTargetHeight(max, min, max, { exaggeration: 0.5 });
  // logPosition = 1, gain = 9, exaggeration = 0.5 => 1 + 9 * 0.5 * 1 = 5.5
  assert.equal(maxHeight, 1 + DEFAULT_HEIGHT_GAIN * 0.5 * 1);
});

test("ESC-06 computeHeightTargets returns a Float32Array in the same order", () => {
  const values = new Float64Array([10, 100, 1000]);
  const targets = computeHeightTargets(values, 10, 1000, { exaggeration: 0.5 });
  assert.ok(targets instanceof Float32Array);
  assert.equal(targets.length, 3);
  assert.equal(targets[0], 1);
  assert.equal(targets[2], 5.5);
});

test("ESC-06 in all 8 pairs on real data, class(A) > class(B) implies targetHeight(A) > targetHeight(B)", () => {
  const munJson = JSON.parse(fs.readFileSync("data/municipalities.json", "utf8"));
  const regJson = JSON.parse(fs.readFileSync("data/regions.json", "utf8"));
  const municipalities = munJson.municipalities;
  const regions = regJson.regions;

  for (const indicator of Object.values(INDICATORS)) {
    // 1. Municipality level
    const munValues = municipalities
      .map((/** @type {any} */ m) => indicator.computeValue(m))
      .filter((/** @type {any} */ v) => v !== null && v > 0);
    const munBreaks = computeBreaks(munValues, "municipality");
    const { min: munMin, max: munMax } = findPositiveBounds(munValues);

    for (let i = 0; i < munValues.length - 1; i += 20) {
      for (let j = i + 1; j < munValues.length; j += 20) {
        const valA = munValues[i];
        const valB = munValues[j];
        const classA = classify(valA, munBreaks);
        const classB = classify(valB, munBreaks);
        const heightA = computeTargetHeight(valA, munMin, munMax);
        const heightB = computeTargetHeight(valB, munMin, munMax);

        if (classA > classB) {
          assert.ok(
            heightA > heightB,
            `Municipality: class(${valA})=${classA} > class(${valB})=${classB} but heightA(${heightA}) <= heightB(${heightB})`,
          );
        }
        if (classB > classA) {
          assert.ok(
            heightB > heightA,
            `Municipality: class(${valB})=${classB} > class(${valA})=${classA} but heightB(${heightB}) <= heightA(${heightA})`,
          );
        }
      }
    }

    // 2. Region level
    const regValues = regions
      .map((/** @type {any} */ reg) => {
        const inRegion = municipalities.filter((/** @type {any} */ m) => m.regionCode === reg.code);
        return aggregateIndicator(indicator, inRegion).value;
      })
      .filter((/** @type {any} */ v) => v !== null && v > 0);
    const regBreaks = computeBreaks(regValues, "region");
    const { min: regMin, max: regMax } = findPositiveBounds(regValues);

    for (let i = 0; i < regValues.length; i += 1) {
      for (let j = i + 1; j < regValues.length; j += 1) {
        const valA = regValues[i];
        const valB = regValues[j];
        const classA = classify(valA, regBreaks);
        const classB = classify(valB, regBreaks);
        const heightA = computeTargetHeight(valA, regMin, regMax);
        const heightB = computeTargetHeight(valB, regMin, regMax);

        if (classA > classB) {
          assert.ok(
            heightA > heightB,
            `Region: class(${valA})=${classA} > class(${valB})=${classB} but heightA(${heightA}) <= heightB(${heightB})`,
          );
        }
        if (classB > classA) {
          assert.ok(
            heightB > heightA,
            `Region: class(${valB})=${classB} > class(${valA})=${classA} but heightB(${heightB}) <= heightA(${heightA})`,
          );
        }
      }
    }
  }
});

const HEAT_BAND_TOTAL = 7;
const EXAGGERATION_SAMPLES = [0.4, 0.5, 1, 2];

test("ESC-10 computeStepHeight lifts band i (1 to 7) i/7 of the proportional span above the base", () => {
  for (const exaggeration of EXAGGERATION_SAMPLES) {
    const tallestProportional = computeTargetHeight(1000, 10, 1000, { exaggeration });
    const proportionalSpan = tallestProportional - BASE_HEIGHT;

    assert.ok(computeStepHeight(0, { exaggeration }) > BASE_HEIGHT);
    for (let classIndex = 0; classIndex < HEAT_BAND_TOTAL; classIndex += 1) {
      const expected = BASE_HEIGHT + ((classIndex + 1) / HEAT_BAND_TOTAL) * proportionalSpan;
      const actual = computeStepHeight(classIndex, { exaggeration });
      assert.ok(
        Math.abs(actual - expected) < 1e-12,
        `exaggeration ${exaggeration}, band ${classIndex + 1}: ${actual} is not ${expected}`,
      );
    }
  }
});

test("ESC-10 computeStepHeight tops out at the proportional maximum with the default options", () => {
  assert.equal(computeStepHeight(6), 1 + DEFAULT_HEIGHT_GAIN * 0.5);
  assert.equal(computeStepHeight(6, { gain: 4, exaggeration: 1 }), 5);
});

test("ESC-10 the 7 step heights are strictly increasing for every exaggeration", () => {
  for (const exaggeration of EXAGGERATION_SAMPLES) {
    const heights = [0, 1, 2, 3, 4, 5, 6].map((classIndex) =>
      computeStepHeight(classIndex, { exaggeration }),
    );

    for (let i = 1; i < heights.length; i += 1) {
      assert.ok(heights[i] > heights[i - 1], `exaggeration ${exaggeration}: ${heights}`);
    }
  }
});

test("ESC-10 units of the same band get the same step height, whatever their order", () => {
  const targets = computeStepHeightTargets([2, 5, 2, 5, 2], { exaggeration: 0.7 });

  assert.equal(targets[0], targets[2]);
  assert.equal(targets[2], targets[4]);
  assert.equal(targets[1], targets[3]);
  assert.ok(targets[1] > targets[0]);
});

test("ESC-10 computeStepHeight returns the base height for a unit without a band", () => {
  assert.equal(computeStepHeight(-1), BASE_HEIGHT);
  assert.equal(computeStepHeight(7), BASE_HEIGHT);
  assert.equal(computeStepHeight(2.5), BASE_HEIGHT);
  assert.equal(computeStepHeight(Number.NaN), BASE_HEIGHT);
});

test("ESC-10 computeStepHeightTargets returns a Float32Array in the same order", () => {
  const targets = computeStepHeightTargets(new Int8Array([6, 0, -1, 3]), { exaggeration: 0.5 });

  assert.ok(targets instanceof Float32Array);
  assert.equal(targets.length, 4);
  assert.equal(targets[0], 5.5);
  assert.ok(Math.abs(targets[1] - (1 + 4.5 / 7)) < 1e-6);
  assert.equal(targets[2], BASE_HEIGHT);
  assert.ok(Math.abs(targets[3] - (1 + (4 / 7) * 4.5)) < 1e-6);
});

test("ESC-10 the proportional and flat modes keep their heights", () => {
  const proportional = computeTargetHeight(100, 10, 1000, { exaggeration: 0.5 });

  assert.equal(computeTargetHeight(100, 10, 1000, { heightMode: "data" }), proportional);
  assert.ok(Math.abs(proportional - 3.25) < 1e-12);
  assert.equal(computeTargetHeight(100, 10, 1000, { heightMode: "flat" }), BASE_HEIGHT);
});

test("ESC-10 on real data, at both levels, one height per band and 7 increasing heights", () => {
  const municipalities = readRealMunicipalities();
  const regions = readRealRegions();

  for (const indicator of Object.values(INDICATORS)) {
    const municipalityValues = readMunicipalityValues(indicator, municipalities);
    assertStepHeightsFollowBands(municipalityValues, "municipality");

    const regionValues = readRegionValues(indicator, municipalities, regions);
    assertStepHeightsFollowBands(regionValues, "region");
  }
});

/** @returns {any[]} */
function readRealMunicipalities() {
  return JSON.parse(fs.readFileSync("data/municipalities.json", "utf8")).municipalities;
}

/** @returns {any[]} */
function readRealRegions() {
  return JSON.parse(fs.readFileSync("data/regions.json", "utf8")).regions;
}

/**
 * @param {import("./indicator.js").IndicatorDefinition} indicator
 * @param {any[]} municipalities
 * @returns {number[]}
 */
function readMunicipalityValues(indicator, municipalities) {
  return municipalities
    .map((municipality) => indicator.computeValue(municipality))
    .filter(isPositiveNumber);
}

/**
 * @param {import("./indicator.js").IndicatorDefinition} indicator
 * @param {any[]} municipalities
 * @param {any[]} regions
 * @returns {number[]}
 */
function readRegionValues(indicator, municipalities, regions) {
  return regions
    .map((region) => {
      const inRegion = municipalities.filter(
        (municipality) => municipality.regionCode === region.code,
      );
      return aggregateIndicator(indicator, inRegion).value;
    })
    .filter(isPositiveNumber);
}

/**
 * @param {number | null} value
 * @returns {value is number}
 */
function isPositiveNumber(value) {
  return value !== null && value > 0;
}

/**
 * @param {number[]} values
 * @param {import("./classification.js").TerritorialLevel} level
 */
function assertStepHeightsFollowBands(values, level) {
  const breaks = computeBreaks(values, level);
  const classIndexes = values.map((value) => classify(value, breaks));
  const heights = computeStepHeightTargets(classIndexes);
  const heightsByBand = groupHeightsByBand(classIndexes, heights);

  assert.equal(heightsByBand.size, HEAT_BAND_TOTAL, `${level}: every band has units`);
  for (const [bandIndex, bandHeights] of heightsByBand) {
    assert.equal(bandHeights.size, 1, `${level}: band ${bandIndex + 1} has one height`);
  }

  const orderedHeights = [...heightsByBand.keys()]
    .sort((a, b) => a - b)
    .map((bandIndex) => [...(heightsByBand.get(bandIndex) ?? [])][0]);
  for (let i = 1; i < orderedHeights.length; i += 1) {
    assert.ok(orderedHeights[i] > orderedHeights[i - 1], `${level}: ${orderedHeights}`);
  }
}

/**
 * @param {number[]} classIndexes
 * @param {Float32Array} heights
 * @returns {Map<number, Set<number>>}
 */
function groupHeightsByBand(classIndexes, heights) {
  /** @type {Map<number, Set<number>>} */
  const heightsByBand = new Map();
  for (let i = 0; i < classIndexes.length; i += 1) {
    const bandHeights = heightsByBand.get(classIndexes[i]) ?? new Set();
    bandHeights.add(heights[i]);
    heightsByBand.set(classIndexes[i], bandHeights);
  }
  return heightsByBand;
}
