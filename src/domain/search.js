/**
 * @typedef {import("./territory.js").TerritoryIndex} TerritoryIndex
 * @typedef {{ kind: "municipality" | "region", code: string, label: string, key: string }} SearchEntry
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
 * Builds one entry per municipality and per region. Repeated municipality
 * names get the region label appended: "Nome (região)".
 * @param {TerritoryIndex} territory
 * @returns {SearchEntry[]}
 */
export function buildSearchEntries(territory) {
  const municipalityEntries = buildMunicipalityEntries(territory);
  const regionEntries = territory.regions().map(makeRegionEntry);
  return [...municipalityEntries, ...regionEntries];
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
 * @param {TerritoryIndex} territory
 * @returns {SearchEntry[]}
 */
function buildMunicipalityEntries(territory) {
  const records = territory
    .regions()
    .flatMap((region) => territory.municipalitiesInRegion(region.code));
  const nameCounts = countNames(records);
  return records.map((record) => {
    const label = labelFor(record, nameCounts, territory);
    return { kind: "municipality", code: record.code, label, key: normalizeName(record.name) };
  });
}

/**
 * @param {import("./territory.js").MunicipalityRecord[]} records
 * @returns {Map<string, number>}
 */
function countNames(records) {
  const counts = new Map();
  for (const record of records) {
    const key = normalizeName(record.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * @param {import("./territory.js").MunicipalityRecord} record
 * @param {Map<string, number>} nameCounts
 * @param {TerritoryIndex} territory
 * @returns {string}
 */
function labelFor(record, nameCounts, territory) {
  const count = nameCounts.get(normalizeName(record.name)) ?? 0;
  if (count < 2) {
    return record.name;
  }
  const region = territory.regionOf(record.code);
  if (!region) {
    return record.name;
  }
  return `${record.name} (${region.label})`;
}

/**
 * @param {import("./territory.js").RegionRecord} region
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
