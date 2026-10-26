/**
 * @typedef {{
 *   code: string,
 *   name: string,
 *   regionCode: string,
 *   governmentRegionCode?: string,
 *   governmentRegionName?: string,
 *   population: number,
 *   areaKm2: number,
 *   gdpThousandBrl: number
 * }} MunicipalityRecord
 * @typedef {{ code: string, label: string }} RegionRecord
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} BoundingBox
 * @typedef {{ x: number, y: number }} CenterPoint
 * @typedef {{
 *   municipalityByCode: (code: string) => MunicipalityRecord | undefined,
 *   codeByName: (name: string) => string | undefined,
 *   nameByCode: (code: string) => string | undefined,
 *   regionOf: (code: string) => RegionRecord | undefined,
 *   governmentRegionOf: (code: string) => RegionRecord | undefined,
 *   regions: () => RegionRecord[],
 *   governmentRegions: () => RegionRecord[],
 *   municipalitiesInRegion: (regionCode: string) => MunicipalityRecord[],
 *   municipalitiesInGovernmentRegion: (governmentRegionCode: string) => MunicipalityRecord[],
 *   boxOf: (code: string) => BoundingBox | undefined,
 *   centerOf: (code: string) => CenterPoint | undefined,
 *   groupOf: (level: string, codeOrRecord: string | MunicipalityRecord) => string
 * }} TerritoryIndex
 */

/**
 * Last created territory instance used as default context when resolving groupOf without context.
 * @type {TerritoryIndex | null}
 */
let lastCreatedTerritory = null;

/**
 * Maps a municipality code or record to its group code at the requested territorial level:
 * - "municipality": returns the municipal code itself.
 * - "governmentRegion": returns the government region code (e.g. "rg-1" to "rg-43").
 * - "region": returns the administrative region code (e.g. "1" to "16").
 *
 * @param {string} level
 * @param {string | MunicipalityRecord} codeOrRecord
 * @param {TerritoryIndex | MunicipalityRecord[]} [context]
 * @returns {string}
 */
export function groupOf(level, codeOrRecord, context) {
  if (level === "municipality") {
    if (typeof codeOrRecord === "object" && codeOrRecord !== null) {
      return codeOrRecord.code;
    }
    return String(codeOrRecord);
  }

  const record = resolveMunicipalityRecord(codeOrRecord, context);
  if (!record) {
    if (typeof codeOrRecord === "object" && codeOrRecord !== null) {
      return codeOrRecord.code;
    }
    return String(codeOrRecord);
  }

  if (level === "governmentRegion") {
    if (record.governmentRegionCode) {
      return record.governmentRegionCode;
    }
    if (record.regionCode) {
      return record.regionCode;
    }
    return record.code;
  }

  if (level === "region") {
    if (record.regionCode) {
      return record.regionCode;
    }
    return record.code;
  }

  return record.code;
}

/**
 * Creates an indexed lookup for municipalities, regions, government regions and spatial boundaries.
 * @param {{
 *   municipalities: MunicipalityRecord[],
 *   regions: RegionRecord[],
 *   governmentRegions?: RegionRecord[],
 *   boxes?: Map<string, BoundingBox>
 * }} context
 * @returns {TerritoryIndex}
 */
export function createTerritory({
  municipalities,
  regions,
  governmentRegions = [],
  boxes = new Map(),
}) {
  const municipalityMap = buildMunicipalityMap(municipalities);
  const nameToCodeMap = buildNameMap(municipalities);
  const regionMap = buildRegionMap(regions);
  const regionMembersMap = buildRegionMembersMap(municipalities);

  const resolvedGovernmentRegions = buildGovernmentRegionList(municipalities, governmentRegions);
  const governmentRegionMap = buildRegionMap(resolvedGovernmentRegions);
  const governmentRegionMembersMap = buildGovernmentRegionMembersMap(municipalities);

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
    const record = municipalityMap.get(code);
    if (!record) {
      return undefined;
    }
    return record.name;
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

  /**
   * @param {string} code
   */
  function governmentRegionOf(code) {
    const municipality = municipalityMap.get(code);
    if (!municipality) {
      return undefined;
    }
    if (!municipality.governmentRegionCode) {
      return undefined;
    }
    return governmentRegionMap.get(municipality.governmentRegionCode);
  }

  function listRegions() {
    return regions;
  }

  function listGovernmentRegions() {
    return resolvedGovernmentRegions;
  }

  /**
   * @param {string} regionCode
   */
  function municipalitiesInRegion(regionCode) {
    return regionMembersMap.get(regionCode) ?? [];
  }

  /**
   * @param {string} governmentRegionCode
   */
  function municipalitiesInGovernmentRegion(governmentRegionCode) {
    return governmentRegionMembersMap.get(governmentRegionCode) ?? [];
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

  /**
   * @param {string} level
   * @param {string | MunicipalityRecord} codeOrRecord
   */
  function resolveGroup(level, codeOrRecord) {
    return groupOf(level, codeOrRecord, territoryInstance);
  }

  /** @type {TerritoryIndex} */
  const territoryInstance = {
    municipalityByCode,
    codeByName,
    nameByCode,
    regionOf,
    governmentRegionOf,
    regions: listRegions,
    governmentRegions: listGovernmentRegions,
    municipalitiesInRegion,
    municipalitiesInGovernmentRegion,
    boxOf,
    centerOf,
    groupOf: resolveGroup,
  };

  lastCreatedTerritory = territoryInstance;
  return territoryInstance;
}

/**
 * @param {string | MunicipalityRecord} codeOrRecord
 * @param {TerritoryIndex | MunicipalityRecord[] | undefined} context
 * @returns {MunicipalityRecord | null}
 */
function resolveMunicipalityRecord(codeOrRecord, context) {
  if (typeof codeOrRecord === "object" && codeOrRecord !== null) {
    return codeOrRecord;
  }
  const code = String(codeOrRecord);
  if (context && !Array.isArray(context) && typeof context.municipalityByCode === "function") {
    const found = context.municipalityByCode(code);
    if (found) {
      return found;
    }
  }
  if (Array.isArray(context)) {
    for (let i = 0; i < context.length; i += 1) {
      if (context[i].code === code) {
        return context[i];
      }
    }
  }
  if (lastCreatedTerritory) {
    const fromLast = lastCreatedTerritory.municipalityByCode(code);
    if (fromLast) {
      return fromLast;
    }
  }
  return null;
}

/**
 * @param {MunicipalityRecord[]} municipalities
 * @returns {Map<string, MunicipalityRecord>}
 */
function buildMunicipalityMap(municipalities) {
  /** @type {Map<string, MunicipalityRecord>} */
  const map = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const municipality = municipalities[i];
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
  for (let i = 0; i < municipalities.length; i += 1) {
    const municipality = municipalities[i];
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
  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
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
  for (let i = 0; i < municipalities.length; i += 1) {
    const municipality = municipalities[i];
    const list = map.get(municipality.regionCode);
    if (list) {
      list.push(municipality);
      continue;
    }
    map.set(municipality.regionCode, [municipality]);
  }
  return map;
}

/**
 * @param {MunicipalityRecord[]} municipalities
 * @param {RegionRecord[]} provided
 * @returns {RegionRecord[]}
 */
function buildGovernmentRegionList(municipalities, provided) {
  if (provided && provided.length > 0) {
    return provided;
  }
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const municipality = municipalities[i];
    const code = municipality.governmentRegionCode;
    if (code && !seen.has(code)) {
      let label = municipality.governmentRegionName;
      if (!label) {
        label = code;
      }
      seen.set(code, label);
    }
  }
  /** @type {RegionRecord[]} */
  const result = [];
  for (const [code, label] of seen.entries()) {
    result.push({ code, label });
  }
  return result;
}

/**
 * @param {MunicipalityRecord[]} municipalities
 * @returns {Map<string, MunicipalityRecord[]>}
 */
function buildGovernmentRegionMembersMap(municipalities) {
  /** @type {Map<string, MunicipalityRecord[]>} */
  const map = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const municipality = municipalities[i];
    const code = municipality.governmentRegionCode;
    if (!code) {
      continue;
    }
    const list = map.get(code);
    if (list) {
      list.push(municipality);
      continue;
    }
    map.set(code, [municipality]);
  }
  return map;
}
