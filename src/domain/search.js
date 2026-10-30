import { UF_CODE_TO_SIGLA } from "./territory-constants.js";

/**
 * @typedef {import("./territory.js").TerritoryIndex} TerritoryIndex
 * @typedef {import("./territory.js").MunicipalityRecord} MunicipalityRecord
 * @typedef {import("./territory.js").RegionRecord} RegionRecord
 * @typedef {{
 *   kind: "municipality" | "region" | "governmentRegion",
 *   code: string,
 *   label: string,
 *   key: string,
 *   ufSigla?: string,
 *   uf?: string
 * }} SearchEntry
 */

const DEFAULT_LIMIT = 8;

/**
 * Lowercases, drops accents and collapses whitespace so names compare loosely.
 * @param {string} text
 * @returns {string}
 */
export function normalizeName(text) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds one entry per municipality, per administrative region and per government region.
 * Municipalities with available UF abbreviation are labeled as "Name, UF" (e.g. "Campinas, SP").
 * Repeated municipality labels get the region label appended: "Name, UF (region)".
 * @param {TerritoryIndex} territory
 * @returns {SearchEntry[]}
 */
export function buildSearchEntries(territory) {
  const municipalityEntries = buildMunicipalityEntries(territory);
  const regionEntries = territory.regions().map(makeRegionEntry);
  const governmentRegionEntries = readGovernmentRegionEntries(territory);
  return [...municipalityEntries, ...regionEntries, ...governmentRegionEntries];
}

/**
 * Returns entries whose name contains the query, prefix matches first.
 * @param {SearchEntry[]} entries
 * @param {string} query
 * @param {number} [limit]
 * @returns {SearchEntry[]}
 */
export function findSuggestions(entries, query, limit = DEFAULT_LIMIT) {
  const needle = normalizeName(query);
  if (needle === "") {
    return [];
  }
  const matches = entries.filter((entry) => entry.key.includes(needle));
  const prefixMatches = matches.filter((entry) => entry.key.startsWith(needle));
  const innerMatches = matches.filter((entry) => !entry.key.startsWith(needle));
  return [...prefixMatches, ...innerMatches].slice(0, limit);
}

/**
 * Resolves the two-letter UF abbreviation for a municipality if available.
 * @param {MunicipalityRecord} record
 * @param {TerritoryIndex} [territory]
 * @returns {string | null}
 */
export function resolveUfSigla(record, territory) {
  if (record.ufSigla && typeof record.ufSigla === "string") {
    return record.ufSigla.toUpperCase();
  }
  if (record.uf && typeof record.uf === "string") {
    const trimmed = record.uf.trim().toUpperCase();
    if (trimmed.length === 2 && !isDigits(trimmed)) {
      return trimmed;
    }
  }
  if (record.stateSigla && typeof record.stateSigla === "string") {
    return record.stateSigla.toUpperCase();
  }
  if (record.ufCode && typeof record.ufCode === "string") {
    const fromCode = UF_CODE_TO_SIGLA.get(record.ufCode);
    if (fromCode) {
      return fromCode;
    }
  }
  if (territory && typeof territory.ufOf === "function") {
    const ufRecord = territory.ufOf(record.code);
    if (ufRecord) {
      if (ufRecord.code && ufRecord.code.length === 2 && !isDigits(ufRecord.code)) {
        return ufRecord.code.toUpperCase();
      }
      if (ufRecord.label && ufRecord.label.length === 2 && !isDigits(ufRecord.label)) {
        return ufRecord.label.toUpperCase();
      }
    }
  }
  if (record.code && typeof record.code === "string" && record.code.length >= 6) {
    const prefix = record.code.slice(0, 2);
    if (prefix !== "35" && UF_CODE_TO_SIGLA.has(prefix)) {
      return UF_CODE_TO_SIGLA.get(prefix) ?? null;
    }
  }
  return null;
}

/**
 * Builds a search entry for a single municipality record.
 *
 * @param {MunicipalityRecord} record
 * @param {TerritoryIndex} [territory]
 * @returns {SearchEntry}
 */
export function buildMunicipalitySearchEntry(record, territory) {
  const ufSigla = resolveUfSigla(record, territory);
  let label = record.name;
  if (ufSigla && !record.name.endsWith(`, ${ufSigla}`)) {
    label = `${record.name}, ${ufSigla}`;
  }
  const key = makeSearchKey(record, label, territory);
  /** @type {SearchEntry} */
  const entry = {
    kind: "municipality",
    code: record.code,
    label,
    key,
  };
  if (ufSigla) {
    entry.ufSigla = ufSigla;
    entry.uf = ufSigla;
  }
  return entry;
}

/**
 * @param {TerritoryIndex} territory
 * @returns {SearchEntry[]}
 */
function buildMunicipalityEntries(territory) {
  const records = readAllMunicipalities(territory);
  const labelCounts = countLabels(records, territory);
  return records.map((record) => {
    const label = labelFor(record, labelCounts, territory);
    const key = makeSearchKey(record, label, territory);
    const ufSigla = resolveUfSigla(record, territory);
    /** @type {SearchEntry} */
    const entry = { kind: "municipality", code: record.code, label, key };
    if (ufSigla) {
      entry.ufSigla = ufSigla;
      entry.uf = ufSigla;
    }
    return entry;
  });
}

/**
 * @param {TerritoryIndex} territory
 * @returns {MunicipalityRecord[]}
 */
function readAllMunicipalities(territory) {
  if (typeof territory.municipalities === "function") {
    const list = territory.municipalities();
    if (list && list.length > 0) {
      return list;
    }
  }
  if (typeof territory.regions === "function") {
    const regions = territory.regions();
    if (regions && regions.length > 0) {
      return regions.flatMap((region) => territory.municipalitiesInRegion(region.code));
    }
  }
  return [];
}

/**
 * @param {MunicipalityRecord[]} records
 * @param {TerritoryIndex} territory
 * @returns {Map<string, number>}
 */
function countLabels(records, territory) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const ufSigla = resolveUfSigla(record, territory);
    let base = record.name;
    if (ufSigla && !record.name.endsWith(`, ${ufSigla}`)) {
      base = `${record.name}, ${ufSigla}`;
    }
    const key = normalizeName(base);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * @param {MunicipalityRecord} record
 * @param {Map<string, number>} labelCounts
 * @param {TerritoryIndex} territory
 * @returns {string}
 */
function labelFor(record, labelCounts, territory) {
  const ufSigla = resolveUfSigla(record, territory);
  let baseLabel = record.name;
  if (ufSigla && !record.name.endsWith(`, ${ufSigla}`)) {
    baseLabel = `${record.name}, ${ufSigla}`;
  }

  const count = labelCounts.get(normalizeName(baseLabel)) ?? 0;
  if (count < 2) {
    return baseLabel;
  }
  const region = territory.regionOf(record.code);
  if (!region) {
    return baseLabel;
  }
  return `${baseLabel} (${region.label})`;
}

/**
 * @param {MunicipalityRecord} record
 * @param {string} label
 * @param {TerritoryIndex} [territory]
 * @returns {string}
 */
function makeSearchKey(record, label, territory) {
  const ufSigla = resolveUfSigla(record, territory);
  if (!ufSigla) {
    return normalizeName(record.name);
  }
  const nameNorm = normalizeName(record.name);
  const labelNorm = normalizeName(label);
  const spaceNorm = normalizeName(`${record.name} ${ufSigla}`);
  if (labelNorm === nameNorm) {
    return nameNorm;
  }
  return `${labelNorm} ${spaceNorm} ${nameNorm}`;
}

/**
 * @param {RegionRecord} region
 * @returns {SearchEntry}
 */
function makeRegionEntry(region) {
  return {
    kind: "region",
    code: region.code,
    label: region.label,
    key: normalizeName(region.label),
  };
}

/**
 * @param {TerritoryIndex} territory
 * @returns {SearchEntry[]}
 */
function readGovernmentRegionEntries(territory) {
  if (typeof territory.governmentRegions !== "function") {
    return [];
  }
  return territory.governmentRegions().map(makeGovernmentRegionEntry);
}

/**
 * @param {RegionRecord} region
 * @returns {SearchEntry}
 */
function makeGovernmentRegionEntry(region) {
  return {
    kind: "governmentRegion",
    code: region.code,
    label: region.label,
    key: normalizeName(region.label),
  };
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isDigits(text) {
  return /^\d+$/.test(text);
}
