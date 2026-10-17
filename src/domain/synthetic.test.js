import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { generateSyntheticValues, SYNTHETIC_INDICATOR } from "./synthetic.js";

const SEAT_CODES = [
  "3502804",
  "3505500",
  "3506003",
  "3509502",
  "3503208",
  "3516200",
  "3522406",
  "3529005",
  "3541406",
  "3542602",
  "3543402",
  "3550308",
  "3548500",
  "3549805",
  "3549904",
  "3552205",
];
const CAPITAL_INDEX = 11;
const MUNICIPALITY_COUNT = 645;
const GRID_COLUMNS = 35;
const GRID_SPACING = 3000;

// Pinned from this port. Regenerate only when the algorithm changes on purpose.
const PINNED_HASHES = [
  { drawNumber: 1, sha256: "943ce5eff77391b1468d59a9de7ddebc93f78978c89b77ab30c56fc35efb1fc8" },
  { drawNumber: 10, sha256: "d206099a1470f436f0ab7bf267707d250d1db8b7ecfa2bf6e3c8496e5c251d0c" },
  { drawNumber: 99999, sha256: "d0052000f109eae73471d83b431e8f31731fb4b708f4f9f05fe4545f98491d5e" },
];

/**
 * Fixture: a grid of municipalities with the 16 region seats in the first positions.
 * @param {string[]} codes
 */
function buildTerritory(codes) {
  return codes.map((code, index) => ({
    code,
    center: {
      x: (index % GRID_COLUMNS) * GRID_SPACING,
      y: Math.floor(index / GRID_COLUMNS) * GRID_SPACING,
    },
  }));
}

function buildSeatTerritory() {
  const codes = Array.from({ length: MUNICIPALITY_COUNT }, (_, index) => {
    if (index < SEAT_CODES.length) return SEAT_CODES[index];
    return String(3600000 + index);
  });
  return buildTerritory(codes);
}

function buildSeatlessTerritory() {
  const codes = Array.from({ length: MUNICIPALITY_COUNT }, (_, index) => String(3600000 + index));
  return buildTerritory(codes);
}

/**
 * @param {Float64Array} values
 * @returns {string}
 */
function hashValues(values) {
  const bytes = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
  return createHash("sha256").update(bytes).digest("hex");
}

for (const { drawNumber, sha256 } of PINNED_HASHES) {
  test(`DEM-03 draw ${drawNumber} keeps the pinned vector`, () => {
    const values = generateSyntheticValues(buildSeatTerritory(), drawNumber);
    assert.equal(hashValues(values), sha256);
  });
}

test("DEM-03 same draw number gives the same vector", () => {
  const territory = buildSeatTerritory();
  const first = generateSyntheticValues(territory, 10);
  const second = generateSyntheticValues(territory, 10);
  assert.deepEqual(second, first);
});

test("DEM-03 different draw numbers give different vectors", () => {
  const territory = buildSeatTerritory();
  const first = generateSyntheticValues(territory, 1);
  const second = generateSyntheticValues(territory, 2);
  assert.notEqual(hashValues(second), hashValues(first));
});

test("DEM-03 returns one value per municipality in a Float64Array", () => {
  const values = generateSyntheticValues(buildSeatTerritory(), 1);
  assert.ok(values instanceof Float64Array);
  assert.equal(values.length, MUNICIPALITY_COUNT);
});

test("DEM-03 capital and region seats get their peak ranges", () => {
  const values = generateSyntheticValues(buildSeatTerritory(), 1);
  const capitalValue = values[CAPITAL_INDEX];
  assert.ok(capitalValue >= 120 && capitalValue <= 199);
  for (let seatIndex = 0; seatIndex < SEAT_CODES.length; seatIndex += 1) {
    if (seatIndex === CAPITAL_INDEX) continue;
    assert.ok(values[seatIndex] >= 12 && values[seatIndex] <= 51);
  }
});

test("DEM-03 without region seats no value exceeds the far-field range", () => {
  const values = generateSyntheticValues(buildSeatlessTerritory(), 99999);
  assert.ok(values.every((value) => value >= 0 && value <= 4));
});

test("DEM-03 synthetic indicator aggregates by sum", () => {
  assert.deepEqual(SYNTHETIC_INDICATOR.aggregation, { type: "sum", field: "value" });
});
