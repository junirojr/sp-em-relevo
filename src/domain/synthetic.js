import { formatAbbreviated, formatValue } from "./format.js";

/** @typedef {import("./indicator.js").IndicatorDefinition} IndicatorDefinition */
/** @typedef {{ x: number, y: number }} CenterPoint */
/** @typedef {{ code: string, center: CenterPoint }} SyntheticMunicipality */
/** @typedef {Omit<IndicatorDefinition, "computeValue">} SyntheticIndicator */

const SYNTHETIC_INDICATOR_ID = "synthetic";
const CAPITAL_CODE = "3550308";
// The synthetic values cluster around the seats of the 16 administrative regions: public geography,
// not data from any registry.
const REGION_SEAT_CODES = [
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
// Draw N uses seed DRAW_SEED_BASE + N, so the same draw number always means the same vector.
const DRAW_SEED_BASE = 20261014;
const HUB_DECAY_DISTANCE = 26000;

/**
 * Value of a synthetic indicator. It has no computeValue because its values come from
 * generateSyntheticValues, not from municipality records.
 * @type {SyntheticIndicator}
 */
export const SYNTHETIC_INDICATOR = {
  id: SYNTHETIC_INDICATOR_ID,
  label: "Valor sintético",
  unit: "unidades",
  year: "",
  yearDescription: "",
  source: "Gerador sintético de demonstração",
  sourceUrl: "",
  aggregation: {
    type: "sum",
    field: "value",
  },
  format: (value) => formatValue(value, SYNTHETIC_INDICATOR_ID),
  formatAbbreviated: (value) => formatAbbreviated(value, SYNTHETIC_INDICATOR_ID),
};

/**
 * Builds one made-up value per municipality for trying the map. The same draw number always
 * gives the same vector. Values peak at the region seats and at the capital.
 * @param {SyntheticMunicipality[]} municipalities in territory order, each with its map center
 * @param {number} drawNumber
 * @returns {Float64Array} one value per municipality, in the same order
 */
export function generateSyntheticValues(municipalities, drawNumber) {
  const random = createSeededRandom(DRAW_SEED_BASE + drawNumber);
  const hubIndexes = findSeatIndexes(municipalities);
  const capitalIndex = municipalities.findIndex(
    (municipality) => municipality.code === CAPITAL_CODE,
  );
  const values = new Float64Array(municipalities.length);

  fillRegionalValues(values, municipalities, hubIndexes, random);
  fillHubValues(values, hubIndexes, random);
  fillCapitalValue(values, capitalIndex, random);
  return values;
}

/**
 * @param {SyntheticMunicipality[]} municipalities
 * @returns {number[]} indexes of the region seats that exist in the territory, in seat order
 */
function findSeatIndexes(municipalities) {
  return REGION_SEAT_CODES.map((seatCode) =>
    municipalities.findIndex((municipality) => municipality.code === seatCode),
  ).filter((index) => index >= 0);
}

/**
 * @param {Float64Array} values
 * @param {SyntheticMunicipality[]} municipalities
 * @param {number[]} hubIndexes
 * @param {() => number} random
 */
function fillRegionalValues(values, municipalities, hubIndexes, random) {
  municipalities.forEach((municipality, index) => {
    const closeness = closenessToNearestHub(municipality.center, municipalities, hubIndexes);
    if (random() > 0.1 + 0.55 * closeness) return;

    values[index] = 1 + Math.floor(random() ** 2.2 * (4 + 22 * closeness));
  });
}

/**
 * @param {CenterPoint} center
 * @param {SyntheticMunicipality[]} municipalities
 * @param {number[]} hubIndexes
 * @returns {number} value between 0 and 1, close to 1 near a seat
 */
function closenessToNearestHub(center, municipalities, hubIndexes) {
  const distances = hubIndexes.map((hubIndex) =>
    distanceBetween(center, municipalities[hubIndex].center),
  );
  const nearestHubDistance = Math.min(...distances);
  return Math.exp(-nearestHubDistance / HUB_DECAY_DISTANCE);
}

/**
 * @param {Float64Array} values
 * @param {number[]} hubIndexes
 * @param {() => number} random
 */
function fillHubValues(values, hubIndexes, random) {
  hubIndexes.forEach((hubIndex) => {
    values[hubIndex] = 12 + Math.floor(random() * 40);
  });
}

/**
 * @param {Float64Array} values
 * @param {number} capitalIndex
 * @param {() => number} random
 */
function fillCapitalValue(values, capitalIndex, random) {
  if (capitalIndex < 0) return;

  values[capitalIndex] = 120 + Math.floor(random() * 80);
}

/**
 * @param {CenterPoint} from
 * @param {CenterPoint} to
 * @returns {number}
 */
function distanceBetween(from, to) {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Mulberry32: tiny, fast and repeatable, so the same seed always gives the same sequence.
 * @param {number} seed
 * @returns {() => number} generator of numbers in [0, 1)
 */
function createSeededRandom(seed) {
  let current = seed >>> 0;
  return () => {
    current = (current + 0x6d2b79f5) >>> 0;
    let mixed = current;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
