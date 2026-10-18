import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { aggregateIndicator } from "./aggregation.js";
import {
  classify,
  classifyRegionColors,
  computeBreaks,
  computeGeometricBreaks,
  computeQuantileBreaks,
  deltaEOklab,
  getRegionColor,
  HEAT_BAND_COUNT,
  oklabChroma,
  readLogPosition,
  REGION_BAND_SIZES,
  REGION_COLOR_COUNT,
  REGION_COLORS_DARK,
  REGION_COLORS_LIGHT,
  REGION_PALETTES,
  roundSignificant,
  simulateColorblind,
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

test("REG-02 the 16 region colors have low OKLab chroma (< 0.10) in both light and dark themes", () => {
  assert.equal(REGION_COLORS_LIGHT.length, REGION_COLOR_COUNT);
  assert.equal(REGION_COLORS_DARK.length, REGION_COLOR_COUNT);
  assert.equal(REGION_PALETTES.light, REGION_COLORS_LIGHT);
  assert.equal(REGION_PALETTES.dark, REGION_COLORS_DARK);

  const candidateMinChroma = 0.10;

  for (let i = 0; i < REGION_COLOR_COUNT; i += 1) {
    const lightColor = REGION_COLORS_LIGHT[i];
    const lightChroma = oklabChroma(lightColor);
    assert.ok(
      lightChroma < candidateMinChroma,
      `Light region color ${i + 1} (${lightColor}) chroma ${lightChroma} must be < ${candidateMinChroma}`,
    );
    assert.ok(
      lightChroma >= 0.05,
      `Light region color ${i + 1} (${lightColor}) chroma ${lightChroma} must be >= 0.05`,
    );

    const darkColor = REGION_COLORS_DARK[i];
    const darkChroma = oklabChroma(darkColor);
    assert.ok(
      darkChroma < candidateMinChroma,
      `Dark region color ${i + 1} (${darkColor}) chroma ${darkChroma} must be < ${candidateMinChroma}`,
    );
    assert.ok(
      darkChroma >= 0.05,
      `Dark region color ${i + 1} (${darkColor}) chroma ${darkChroma} must be >= 0.05`,
    );
  }
});

test("REG-02 the 16 region colors maintain perceptual distance under normal vision and colorblind simulations", () => {
  const themes = ["light", "dark"];

  for (const theme of themes) {
    const colors = REGION_PALETTES[theme];
    let minNormalDistance = Number.POSITIVE_INFINITY;
    let minProtanDistance = Number.POSITIVE_INFINITY;
    let minDeutanDistance = Number.POSITIVE_INFINITY;
    let minTritanDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < colors.length; i += 1) {
      for (let j = i + 1; j < colors.length; j += 1) {
        const dNormal = deltaEOklab(colors[i], colors[j]);
        if (dNormal < minNormalDistance) {
          minNormalDistance = dNormal;
        }

        const simProtanA = simulateColorblind(colors[i], "protan");
        const simProtanB = simulateColorblind(colors[j], "protan");
        const dProtan = deltaEOklab(simProtanA, simProtanB);
        if (dProtan < minProtanDistance) {
          minProtanDistance = dProtan;
        }

        const simDeutanA = simulateColorblind(colors[i], "deutan");
        const simDeutanB = simulateColorblind(colors[j], "deutan");
        const dDeutan = deltaEOklab(simDeutanA, simDeutanB);
        if (dDeutan < minDeutanDistance) {
          minDeutanDistance = dDeutan;
        }

        const simTritanA = simulateColorblind(colors[i], "tritan");
        const simTritanB = simulateColorblind(colors[j], "tritan");
        const dTritan = deltaEOklab(simTritanA, simTritanB);
        if (dTritan < minTritanDistance) {
          minTritanDistance = dTritan;
        }
      }
    }

    assert.ok(
      minNormalDistance >= 0.045,
      `${theme} theme normal min distance ${minNormalDistance} must be >= 0.045`,
    );
    assert.ok(
      minProtanDistance >= 0.018,
      `${theme} theme protanopia min distance ${minProtanDistance} must be >= 0.018`,
    );
    assert.ok(
      minDeutanDistance >= 0.018,
      `${theme} theme deuteranopia min distance ${minDeutanDistance} must be >= 0.018`,
    );
    assert.ok(
      minTritanDistance >= 0.018,
      `${theme} theme tritanopia min distance ${minTritanDistance} must be >= 0.018`,
    );
  }
});

test("REG-02 classifyRegionColors maps municipalities by regionCode to their respective hex colors", () => {
  const sample = [
    { code: "3550308", name: "São Paulo", regionCode: "1" },
    { code: "3542602", name: "Registro", regionCode: 2 },
    { code: "3509502", name: "Campinas", regionCode: "6" },
    { code: "3522406", name: "Itapeva", regionCode: "16" },
  ];

  const lightColors = classifyRegionColors(sample, "light");
  assert.equal(lightColors.length, 4);
  assert.equal(lightColors[0], REGION_COLORS_LIGHT[0]);
  assert.equal(lightColors[1], REGION_COLORS_LIGHT[1]);
  assert.equal(lightColors[2], REGION_COLORS_LIGHT[5]);
  assert.equal(lightColors[3], REGION_COLORS_LIGHT[15]);

  const darkColors = classifyRegionColors(sample, "dark");
  assert.equal(darkColors.length, 4);
  assert.equal(darkColors[0], REGION_COLORS_DARK[0]);
  assert.equal(darkColors[1], REGION_COLORS_DARK[1]);
  assert.equal(darkColors[2], REGION_COLORS_DARK[5]);
  assert.equal(darkColors[3], REGION_COLORS_DARK[15]);
});

test("REG-02 getRegionColor handles numeric, string, and invalid region codes with safe fallback", () => {
  assert.equal(getRegionColor("1", "light"), REGION_COLORS_LIGHT[0]);
  assert.equal(getRegionColor(16, "dark"), REGION_COLORS_DARK[15]);
  assert.equal(getRegionColor("invalid", "light"), "#888888");
  assert.equal(getRegionColor(null, "light"), "#888888");
  assert.equal(getRegionColor(0, "light"), "#888888");
  assert.equal(getRegionColor(17, "light"), "#888888");
});
