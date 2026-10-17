/**
 * @typedef {import("./territory.js").TerritoryIndex} TerritoryIndex
 * @typedef {{ kind: "municipality" | "region", code: string, name: string, codes: string[] }} PanelUnit
 */

/**
 * Adds the municipality when absent and removes it when present.
 * @param {string[]} selectedCodes
 * @param {string} code
 * @returns {string[]}
 */
export function toggleMunicipality(selectedCodes, code) {
  if (selectedCodes.includes(code)) {
    return selectedCodes.filter((selectedCode) => selectedCode !== code);
  }
  return [...selectedCodes, code];
}

/**
 * Adds the whole region when any code is missing; removes the whole region otherwise.
 * @param {string[]} selectedCodes
 * @param {TerritoryIndex} territory
 * @param {string} regionCode
 * @returns {string[]}
 */
export function toggleRegion(selectedCodes, territory, regionCode) {
  const regionCodes = codesOfRegion(territory, regionCode);
  if (regionCodes.length === 0) {
    return selectedCodes;
  }
  if (containsAll(selectedCodes, regionCodes)) {
    const regionSet = new Set(regionCodes);
    return selectedCodes.filter((code) => !regionSet.has(code));
  }
  return addCodes(selectedCodes, regionCodes);
}

/**
 * Adds the whole region and keeps the codes already selected.
 * @param {string[]} selectedCodes
 * @param {TerritoryIndex} territory
 * @param {string} regionCode
 * @returns {string[]}
 */
export function addRegion(selectedCodes, territory, regionCode) {
  return addCodes(selectedCodes, codesOfRegion(territory, regionCode));
}

/**
 * Replaces the selection with the municipalities of one class.
 * @param {string[]} selectedCodes
 * @param {Map<string, number>} classIndexByCode class index of each municipality
 * @param {number} classIndex
 * @returns {string[]}
 */
export function selectByClassIndex(selectedCodes, classIndexByCode, classIndex) {
  const codes = [];
  for (const [code, index] of classIndexByCode) {
    if (index === classIndex) {
      codes.push(code);
    }
  }
  if (sameCodes(selectedCodes, codes)) {
    return selectedCodes;
  }
  return codes;
}

/**
 * Builds the panel rows: a fully selected region is one row, the rest are municipalities.
 * Rows follow the order in which each unit first appears in the selection.
 * @param {string[]} selectedCodes
 * @param {TerritoryIndex} territory
 * @returns {PanelUnit[]}
 */
export function buildPanelUnits(selectedCodes, territory) {
  const fullRegions = findFullRegions(selectedCodes, territory);
  const emittedRegions = new Set();
  /** @type {PanelUnit[]} */
  const units = [];
  for (const code of selectedCodes) {
    const record = territory.municipalityByCode(code);
    if (!record) {
      continue;
    }
    const region = fullRegions.get(record.regionCode);
    if (!region) {
      units.push({ kind: "municipality", code, name: record.name, codes: [code] });
      continue;
    }
    if (emittedRegions.has(region.code)) {
      continue;
    }
    emittedRegions.add(region.code);
    units.push({
      kind: "region",
      code: region.code,
      name: region.label,
      codes: codesOfRegion(territory, region.code),
    });
  }
  return units;
}

/**
 * @param {string[]} selectedCodes
 * @param {TerritoryIndex} territory
 * @returns {Map<string, import("./territory.js").RegionRecord>}
 */
function findFullRegions(selectedCodes, territory) {
  const selectedSet = new Set(selectedCodes);
  const fullRegions = new Map();
  for (const region of territory.regions()) {
    const regionCodes = codesOfRegion(territory, region.code);
    if (regionCodes.length > 0 && regionCodes.every((code) => selectedSet.has(code))) {
      fullRegions.set(region.code, region);
    }
  }
  return fullRegions;
}

/**
 * @param {TerritoryIndex} territory
 * @param {string} regionCode
 * @returns {string[]}
 */
function codesOfRegion(territory, regionCode) {
  return territory.municipalitiesInRegion(regionCode).map((record) => record.code);
}

/**
 * @param {string[]} selectedCodes
 * @param {string[]} codes
 * @returns {string[]}
 */
function addCodes(selectedCodes, codes) {
  const selectedSet = new Set(selectedCodes);
  const missing = codes.filter((code) => !selectedSet.has(code));
  if (missing.length === 0) {
    return selectedCodes;
  }
  return [...selectedCodes, ...missing];
}

/**
 * @param {string[]} selectedCodes
 * @param {string[]} codes
 * @returns {boolean}
 */
function containsAll(selectedCodes, codes) {
  const selectedSet = new Set(selectedCodes);
  return codes.every((code) => selectedSet.has(code));
}

/**
 * @param {string[]} first
 * @param {string[]} second
 * @returns {boolean}
 */
function sameCodes(first, second) {
  if (first.length !== second.length) {
    return false;
  }
  return first.every((code, position) => code === second[position]);
}
