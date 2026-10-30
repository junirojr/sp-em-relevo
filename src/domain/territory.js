import { UF_CODE_TO_SIGLA, UF_SIGLA_TO_NAME } from "./territory-constants.js";

export { UF_CODE_TO_SIGLA, UF_SIGLA_TO_NAME };

/**
 * @typedef {{
 *   code: string,
 *   name: string,
 *   regionCode: string,
 *   governmentRegionCode?: string,
 *   governmentRegionName?: string,
 *   uf?: string,
 *   ufCode?: string,
 *   ufSigla?: string,
 *   ufName?: string,
 *   stateCode?: string,
 *   stateSigla?: string,
 *   intermediariaCode?: string,
 *   intermediariaName?: string,
 *   imediataCode?: string,
 *   imediataName?: string,
 *   countryCode?: string,
 *   countryName?: string,
 *   country?: string,
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
 *   ufOf: (code: string) => RegionRecord | undefined,
 *   intermediariaOf: (code: string) => RegionRecord | undefined,
 *   imediataOf: (code: string) => RegionRecord | undefined,
 *   countryOf: (code: string) => RegionRecord | undefined,
 *   regions: () => RegionRecord[],
 *   governmentRegions: () => RegionRecord[],
 *   ufs: () => RegionRecord[],
 *   intermediarias: () => RegionRecord[],
 *   imediatas: () => RegionRecord[],
 *   countries: () => RegionRecord[],
 *   municipalities: () => MunicipalityRecord[],
 *   municipalitiesInRegion: (regionCode: string) => MunicipalityRecord[],
 *   municipalitiesInGovernmentRegion: (governmentRegionCode: string) => MunicipalityRecord[],
 *   municipalitiesInUf: (ufCode: string) => MunicipalityRecord[],
 *   municipalitiesInIntermediaria: (intermediariaCode: string) => MunicipalityRecord[],
 *   municipalitiesInImediata: (imediataCode: string) => MunicipalityRecord[],
 *   municipalitiesInCountry: (countryCode: string) => MunicipalityRecord[],
 *   boxOf: (code: string) => BoundingBox | undefined,
 *   centerOf: (code: string) => CenterPoint | undefined,
 *   groupOf: (level: string, codeOrRecord: string | MunicipalityRecord) => string,
 *   groupRecordOf: (level: string, municipalityCode: string) => RegionRecord | undefined,
 *   groupsOfLevel: (level: string) => RegionRecord[],
 *   municipalitiesInGroup: (level: string, groupCode: string) => MunicipalityRecord[]
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
 * - "imediata": returns the immediate geographic region code.
 * - "intermediaria": returns the intermediate geographic region code.
 * - "uf" or "state": returns the federative unit code or abbreviation.
 * - "country": returns the country code (default "BR").
 * - "governmentRegion": returns the government region code.
 * - "region": returns the administrative region code.
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

  if (level === "country" || level === "pais") {
    if (record.countryCode) {
      return record.countryCode;
    }
    if (typeof record.country === "string" && record.country.length > 0) {
      return record.country;
    }
    return "BR";
  }

  if (level === "uf" || level === "state") {
    if (context && !Array.isArray(context) && typeof context.ufs === "function") {
      const ufList = context.ufs();
      if (ufList.length > 0) {
        const matched = findMatchingUfCode(record, ufList);
        if (matched) {
          return matched;
        }
      }
    }
    if (record.ufCode) {
      return record.ufCode;
    }
    if (record.ufSigla) {
      return record.ufSigla;
    }
    if (typeof record.uf === "string" && record.uf.length > 0) {
      return record.uf;
    }
    if (record.stateCode) {
      return record.stateCode;
    }
    if (record.stateSigla) {
      return record.stateSigla;
    }
    if (record.code && record.code.length >= 6) {
      const prefix = record.code.slice(0, 2);
      if (UF_CODE_TO_SIGLA.has(prefix)) {
        return prefix;
      }
    }
    return record.code;
  }

  if (level === "intermediaria") {
    if (record.intermediariaCode) {
      return record.intermediariaCode;
    }
    return record.code;
  }

  if (level === "imediata") {
    if (record.imediataCode) {
      return record.imediataCode;
    }
    return record.code;
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
 * Creates an indexed lookup for municipalities, regions, government regions, UFs, intermediate/immediate regions, countries and spatial boundaries.
 * @param {{
 *   municipalities?: MunicipalityRecord[],
 *   regions?: RegionRecord[],
 *   governmentRegions?: RegionRecord[],
 *   ufs?: RegionRecord[],
 *   intermediarias?: RegionRecord[],
 *   imediatas?: RegionRecord[],
 *   countries?: RegionRecord[],
 *   boxes?: Map<string, BoundingBox>
 * }} [context]
 * @returns {TerritoryIndex}
 */
export function createTerritory({
  municipalities = [],
  regions = [],
  governmentRegions = [],
  ufs = [],
  intermediarias = [],
  imediatas = [],
  countries = [],
  boxes = new Map(),
} = {}) {
  const municipalityMap = buildMunicipalityMap(municipalities);
  const nameToCodeMap = buildNameMap(municipalities);

  const resolvedRegions = buildRegionList(municipalities, regions);
  const regionMap = buildRegionMap(resolvedRegions);
  const regionMembersMap = buildRegionMembersMap(municipalities);

  const resolvedGovernmentRegions = buildGovernmentRegionList(municipalities, governmentRegions);
  const governmentRegionMap = buildRegionMap(resolvedGovernmentRegions);
  const governmentRegionMembersMap = buildGovernmentRegionMembersMap(municipalities);

  const resolvedUfs = buildUfList(municipalities, ufs);
  const ufMap = buildRegionMap(resolvedUfs);
  const ufMembersMap = buildUfMembersMap(municipalities, resolvedUfs);

  const resolvedIntermediarias = buildIntermediariaList(municipalities, intermediarias);
  const intermediariaMap = buildRegionMap(resolvedIntermediarias);
  const intermediariaMembersMap = buildIntermediariaMembersMap(municipalities);

  const resolvedImediatas = buildImediataList(municipalities, imediatas);
  const imediataMap = buildRegionMap(resolvedImediatas);
  const imediataMembersMap = buildImediataMembersMap(municipalities);

  const resolvedCountries = buildCountryList(municipalities, countries);
  const countryMap = buildRegionMap(resolvedCountries);
  const countryMembersMap = buildCountryMembersMap(municipalities);

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
    if (!municipality.regionCode) {
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

  /**
   * @param {string} code
   */
  function ufOf(code) {
    const mun = municipalityMap.get(code);
    if (!mun) {
      return undefined;
    }
    let group = "";
    if (resolvedUfs.length > 0) {
      const matched = findMatchingUfCode(mun, resolvedUfs);
      if (matched) {
        group = matched;
      }
    }
    if (!group) {
      group = mun.ufSigla || mun.uf || mun.ufCode || "";
    }
    if (!group && mun.code && mun.code.length >= 6) {
      const prefix = mun.code.slice(0, 2);
      if (UF_CODE_TO_SIGLA.has(prefix)) {
        group = prefix;
      }
    }
    if (!group) {
      return undefined;
    }
    return ufMap.get(group);
  }

  /**
   * @param {string} code
   */
  function intermediariaOf(code) {
    const mun = municipalityMap.get(code);
    if (!mun) {
      return undefined;
    }
    if (!mun.intermediariaCode) {
      return undefined;
    }
    return intermediariaMap.get(mun.intermediariaCode);
  }

  /**
   * @param {string} code
   */
  function imediataOf(code) {
    const mun = municipalityMap.get(code);
    if (!mun) {
      return undefined;
    }
    if (!mun.imediataCode) {
      return undefined;
    }
    return imediataMap.get(mun.imediataCode);
  }

  /**
   * @param {string} code
   */
  function countryOf(code) {
    const mun = municipalityMap.get(code);
    if (!mun) {
      return undefined;
    }
    const cCode = groupOf("country", mun, territoryInstance);
    return countryMap.get(cCode);
  }

  function listMunicipalities() {
    return municipalities;
  }

  function listRegions() {
    return resolvedRegions;
  }

  function listGovernmentRegions() {
    return resolvedGovernmentRegions;
  }

  function listUfs() {
    return resolvedUfs;
  }

  function listIntermediarias() {
    return resolvedIntermediarias;
  }

  function listImediatas() {
    return resolvedImediatas;
  }

  function listCountries() {
    return resolvedCountries;
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
   * @param {string} ufCode
   */
  function municipalitiesInUf(ufCode) {
    return ufMembersMap.get(ufCode) ?? [];
  }

  /**
   * @param {string} intermediariaCode
   */
  function municipalitiesInIntermediaria(intermediariaCode) {
    return intermediariaMembersMap.get(intermediariaCode) ?? [];
  }

  /**
   * @param {string} imediataCode
   */
  function municipalitiesInImediata(imediataCode) {
    return imediataMembersMap.get(imediataCode) ?? [];
  }

  /**
   * @param {string} countryCode
   */
  function municipalitiesInCountry(countryCode) {
    return countryMembersMap.get(countryCode) ?? [];
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

  /**
   * @param {string} level
   * @param {string} code
   */
  function groupRecordOf(level, code) {
    if (level === "municipality") {
      const mun = municipalityMap.get(code);
      if (!mun) {
        return undefined;
      }
      return { code: mun.code, label: mun.name };
    }
    if (level === "imediata") {
      return imediataOf(code);
    }
    if (level === "intermediaria") {
      return intermediariaOf(code);
    }
    if (level === "uf" || level === "state") {
      return ufOf(code);
    }
    if (level === "country" || level === "pais") {
      return countryOf(code);
    }
    if (level === "governmentRegion") {
      return governmentRegionOf(code);
    }
    if (level === "region") {
      return regionOf(code);
    }
    return undefined;
  }

  /**
   * @param {string} level
   */
  function groupsOfLevel(level) {
    if (level === "municipality") {
      return municipalities.map((m) => ({ code: m.code, label: m.name }));
    }
    if (level === "imediata") {
      return resolvedImediatas;
    }
    if (level === "intermediaria") {
      return resolvedIntermediarias;
    }
    if (level === "uf" || level === "state") {
      return resolvedUfs;
    }
    if (level === "country" || level === "pais") {
      return resolvedCountries;
    }
    if (level === "governmentRegion") {
      return resolvedGovernmentRegions;
    }
    if (level === "region") {
      return resolvedRegions;
    }
    return [];
  }

  /**
   * @param {string} level
   * @param {string} groupCode
   */
  function municipalitiesInGroup(level, groupCode) {
    if (level === "municipality") {
      const mun = municipalityMap.get(groupCode);
      if (!mun) {
        return [];
      }
      return [mun];
    }
    if (level === "imediata") {
      return municipalitiesInImediata(groupCode);
    }
    if (level === "intermediaria") {
      return municipalitiesInIntermediaria(groupCode);
    }
    if (level === "uf" || level === "state") {
      return municipalitiesInUf(groupCode);
    }
    if (level === "country" || level === "pais") {
      return municipalitiesInCountry(groupCode);
    }
    if (level === "governmentRegion") {
      return municipalitiesInGovernmentRegion(groupCode);
    }
    if (level === "region") {
      return municipalitiesInRegion(groupCode);
    }
    return [];
  }

  /** @type {TerritoryIndex} */
  const territoryInstance = {
    municipalityByCode,
    codeByName,
    nameByCode,
    regionOf,
    governmentRegionOf,
    ufOf,
    intermediariaOf,
    imediataOf,
    countryOf,
    regions: listRegions,
    governmentRegions: listGovernmentRegions,
    ufs: listUfs,
    intermediarias: listIntermediarias,
    imediatas: listImediatas,
    countries: listCountries,
    municipalities: listMunicipalities,
    municipalitiesInRegion,
    municipalitiesInGovernmentRegion,
    municipalitiesInUf,
    municipalitiesInIntermediaria,
    municipalitiesInImediata,
    municipalitiesInCountry,
    boxOf,
    centerOf,
    groupOf: resolveGroup,
    groupRecordOf,
    groupsOfLevel,
    municipalitiesInGroup,
  };

  lastCreatedTerritory = territoryInstance;
  return territoryInstance;
}

/**
 * @param {MunicipalityRecord} record
 * @param {RegionRecord[]} ufList
 * @returns {string | null}
 */
function findMatchingUfCode(record, ufList) {
  /** @type {string[]} */
  const candidates = [];
  if (record.ufCode) {
    candidates.push(record.ufCode);
  }
  if (record.ufSigla) {
    candidates.push(record.ufSigla);
  }
  if (typeof record.uf === "string" && record.uf.length > 0) {
    candidates.push(record.uf);
  }
  if (record.stateCode) {
    candidates.push(record.stateCode);
  }
  if (record.stateSigla) {
    candidates.push(record.stateSigla);
  }
  if (record.code && record.code.length >= 2) {
    const prefix = record.code.slice(0, 2);
    candidates.push(prefix);
    const siglaFromPrefix = UF_CODE_TO_SIGLA.get(prefix);
    if (siglaFromPrefix) {
      candidates.push(siglaFromPrefix);
    }
  }

  for (let i = 0; i < ufList.length; i += 1) {
    const uf = ufList[i];
    for (let j = 0; j < candidates.length; j += 1) {
      if (uf.code === candidates[j]) {
        return uf.code;
      }
    }
  }
  return null;
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
 * @param {RegionRecord[]} provided
 * @returns {RegionRecord[]}
 */
function buildRegionList(municipalities, provided) {
  if (provided && provided.length > 0) {
    return provided;
  }
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const municipality = municipalities[i];
    const code = municipality.regionCode;
    if (code && !seen.has(code)) {
      seen.set(code, code);
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
function buildRegionMembersMap(municipalities) {
  /** @type {Map<string, MunicipalityRecord[]>} */
  const map = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const municipality = municipalities[i];
    if (!municipality.regionCode) {
      continue;
    }
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

/**
 * @param {MunicipalityRecord[]} municipalities
 * @param {RegionRecord[]} provided
 * @returns {RegionRecord[]}
 */
function buildUfList(municipalities, provided) {
  if (provided && provided.length > 0) {
    return provided;
  }
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const m = municipalities[i];
    const code = m.ufSigla || m.uf || m.ufCode || "";
    if (code && !seen.has(code)) {
      let label = m.ufName || "";
      if (!label && UF_SIGLA_TO_NAME.has(code)) {
        label = UF_SIGLA_TO_NAME.get(code) || code;
      }
      if (!label && UF_CODE_TO_SIGLA.has(code)) {
        const sigla = UF_CODE_TO_SIGLA.get(code) || "";
        label = UF_SIGLA_TO_NAME.get(sigla) || sigla;
      }
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
 * @param {RegionRecord[]} resolvedUfs
 * @returns {Map<string, MunicipalityRecord[]>}
 */
function buildUfMembersMap(municipalities, resolvedUfs) {
  /** @type {Map<string, MunicipalityRecord[]>} */
  const map = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const m = municipalities[i];
    let group = "";
    if (resolvedUfs.length > 0) {
      const matched = findMatchingUfCode(m, resolvedUfs);
      if (matched) {
        group = matched;
      }
    }
    if (!group) {
      group = m.ufSigla || m.uf || m.ufCode || "";
    }
    if (!group && m.code && m.code.length >= 6) {
      const prefix = m.code.slice(0, 2);
      if (UF_CODE_TO_SIGLA.has(prefix)) {
        group = prefix;
      }
    }
    if (!group) {
      continue;
    }
    const list = map.get(group);
    if (list) {
      list.push(m);
      continue;
    }
    map.set(group, [m]);
  }
  return map;
}

/**
 * @param {MunicipalityRecord[]} municipalities
 * @param {RegionRecord[]} provided
 * @returns {RegionRecord[]}
 */
function buildIntermediariaList(municipalities, provided) {
  if (provided && provided.length > 0) {
    return provided;
  }
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const m = municipalities[i];
    const code = m.intermediariaCode;
    if (code && !seen.has(code)) {
      let label = m.intermediariaName;
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
function buildIntermediariaMembersMap(municipalities) {
  /** @type {Map<string, MunicipalityRecord[]>} */
  const map = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const m = municipalities[i];
    const code = m.intermediariaCode;
    if (!code) {
      continue;
    }
    const list = map.get(code);
    if (list) {
      list.push(m);
      continue;
    }
    map.set(code, [m]);
  }
  return map;
}

/**
 * @param {MunicipalityRecord[]} municipalities
 * @param {RegionRecord[]} provided
 * @returns {RegionRecord[]}
 */
function buildImediataList(municipalities, provided) {
  if (provided && provided.length > 0) {
    return provided;
  }
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const m = municipalities[i];
    const code = m.imediataCode;
    if (code && !seen.has(code)) {
      let label = m.imediataName;
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
function buildImediataMembersMap(municipalities) {
  /** @type {Map<string, MunicipalityRecord[]>} */
  const map = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const m = municipalities[i];
    const code = m.imediataCode;
    if (!code) {
      continue;
    }
    const list = map.get(code);
    if (list) {
      list.push(m);
      continue;
    }
    map.set(code, [m]);
  }
  return map;
}

/**
 * @param {MunicipalityRecord[]} municipalities
 * @param {RegionRecord[]} provided
 * @returns {RegionRecord[]}
 */
function buildCountryList(municipalities, provided) {
  if (provided && provided.length > 0) {
    return provided;
  }
  /** @type {Map<string, string>} */
  const seen = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const m = municipalities[i];
    let code = m.countryCode || m.country;
    if (!code && municipalities.length > 0) {
      code = "BR";
    }
    if (code && !seen.has(code)) {
      let label = m.countryName;
      if (!label && code === "BR") {
        label = "Brasil";
      }
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
function buildCountryMembersMap(municipalities) {
  /** @type {Map<string, MunicipalityRecord[]>} */
  const map = new Map();
  for (let i = 0; i < municipalities.length; i += 1) {
    const m = municipalities[i];
    const code = m.countryCode || m.country || "BR";
    const list = map.get(code);
    if (list) {
      list.push(m);
      continue;
    }
    map.set(code, [m]);
  }
  return map;
}
