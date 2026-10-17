/**
 * @typedef {{ code: string, name: string, regionCode: string, population: number, areaKm2: number, gdpThousandBrl: number }} MunicipalityRecord
 * @typedef {{ code: string, label: string }} RegionRecord
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} BoundingBox
 * @typedef {{ x: number, y: number }} CenterPoint
 * @typedef {{
 *   municipalityByCode: (code: string) => MunicipalityRecord | undefined,
 *   codeByName: (name: string) => string | undefined,
 *   nameByCode: (code: string) => string | undefined,
 *   regionOf: (code: string) => RegionRecord | undefined,
 *   regions: () => RegionRecord[],
 *   municipalitiesInRegion: (regionCode: string) => MunicipalityRecord[],
 *   boxOf: (code: string) => BoundingBox | undefined,
 *   centerOf: (code: string) => CenterPoint | undefined
 * }} TerritoryIndex
 */

/**
 * Creates an indexed lookup for municipalities, regions, and spatial boundaries.
 * @param {{
 *   municipalities: MunicipalityRecord[],
 *   regions: RegionRecord[],
 *   boxes?: Map<string, BoundingBox>
 * }} context
 * @returns {TerritoryIndex}
 */
export function createTerritory({ municipalities, regions, boxes = new Map() }) {
  const municipalityMap = buildMunicipalityMap(municipalities);
  const nameToCodeMap = buildNameMap(municipalities);
  const regionMap = buildRegionMap(regions);
  const regionMembersMap = buildRegionMembersMap(municipalities);

  /**
   * @param {string} code
   */
  function municipalityByCode(code) {
    return municipalityMap.get(code);
  }

  /**
   * @param {string} name
   */
  function codeByName(name) {
    return nameToCodeMap.get(name);
  }

  /**
   * @param {string} code
   */
  function nameByCode(code) {
    return municipalityMap.get(code)?.name;
  }

  /**
   * @param {string} code
   */
  function regionOf(code) {
    const municipality = municipalityMap.get(code);
    if (!municipality) {
      return undefined;
    }
    return regionMap.get(municipality.regionCode);
  }

  function listRegions() {
    return regions;
  }

  /**
   * @param {string} regionCode
   */
  function municipalitiesInRegion(regionCode) {
    return regionMembersMap.get(regionCode) ?? [];
  }

  /**
   * @param {string} code
   */
  function boxOf(code) {
    return boxes.get(code);
  }

  /**
   * @param {string} code
   */
  function centerOf(code) {
    const box = boxes.get(code);
    if (!box) {
      return undefined;
    }
    return {
      x: (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
    };
  }

  return {
    municipalityByCode,
    codeByName,
    nameByCode,
    regionOf,
    regions: listRegions,
    municipalitiesInRegion,
    boxOf,
    centerOf,
  };
}

/**
 * @param {MunicipalityRecord[]} municipalities
 * @returns {Map<string, MunicipalityRecord>}
 */
function buildMunicipalityMap(municipalities) {
  /** @type {Map<string, MunicipalityRecord>} */
  const map = new Map();
  for (const municipality of municipalities) {
    map.set(municipality.code, municipality);
  }
  return map;
}

/**
 * @param {MunicipalityRecord[]} municipalities
 * @returns {Map<string, string>}
 */
function buildNameMap(municipalities) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const municipality of municipalities) {
    map.set(municipality.name, municipality.code);
  }
  return map;
}

/**
 * @param {RegionRecord[]} regions
 * @returns {Map<string, RegionRecord>}
 */
function buildRegionMap(regions) {
  /** @type {Map<string, RegionRecord>} */
  const map = new Map();
  for (const region of regions) {
    map.set(region.code, region);
  }
  return map;
}

/**
 * @param {MunicipalityRecord[]} municipalities
 * @returns {Map<string, MunicipalityRecord[]>}
 */
function buildRegionMembersMap(municipalities) {
  /** @type {Map<string, MunicipalityRecord[]>} */
  const map = new Map();
  for (const municipality of municipalities) {
    const list = map.get(municipality.regionCode);
    if (list) {
      list.push(municipality);
      continue;
    }
    map.set(municipality.regionCode, [municipality]);
  }
  return map;
}
