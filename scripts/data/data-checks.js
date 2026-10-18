/**
 * Pure rules DAD-01 to DAD-07. Every check returns a list of problems; an empty list means
 * the rule holds. Each problem starts with the rule id, so the build can print them as is.
 *
 * @typedef {import("../../src/domain/topology.js").Topology} Topology
 * @typedef {{ code: string, regionCode: string | null }} RegionMembership
 * @typedef {{ regionCode: string | null, regionLabel: string | null }} RegionLabelRow
 * @typedef {{ regionCode: string | null, population: number | null }} PopulationRecord
 * @typedef {{ field: string, expectation: string, isValid: (value: unknown) => boolean }} MetaRule
 */

import { validateTopology } from "../../src/domain/topology.js";
import { LICENSE_CONDITIONS } from "./sources.js";

export const EXPECTED_MUNICIPALITY_COUNT = 645;
export const EXPECTED_REGION_CODES = Object.freeze(
  Array.from({ length: 16 }, (_, index) => String(index + 1)),
);
export const EXPECTED_GOVERNMENT_REGION_COUNT = 43;
export const EXPECTED_GOVERNMENT_REGION_CODES = Object.freeze(
  Array.from({ length: 43 }, (_, index) => `rg-${index + 1}`),
);
export const MUNICIPALITY_FIELDS = Object.freeze([
  "code",
  "name",
  "regionCode",
  "governmentRegionCode",
  "governmentRegionName",
  "population",
  "areaKm2",
  "gdpThousandBrl",
]);
export const NUMERIC_FIELDS = Object.freeze(["population", "areaKm2", "gdpThousandBrl"]);

const MUNICIPALITY_CODE = /^\d{7}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const BARE_FILE_NAME = /^[\w.-]+$/;
const MESH_GEOMETRY_TYPES = Object.freeze(["Polygon", "MultiPolygon"]);
const LISTED_EXAMPLES = 5;
const LICENSE_CONDITION_SEPARATOR = "; ";
/** @type {readonly string[]} */
const KNOWN_LICENSE_CONDITIONS = Object.freeze(Object.values(LICENSE_CONDITIONS));

/** @type {readonly MetaRule[]} */
const META_RULES = Object.freeze([
  { field: "source", expectation: "a non-empty text", isValid: isNonEmptyText },
  { field: "sourceUrl", expectation: "a non-empty list of https addresses", isValid: isUrlList },
  { field: "year", expectation: "a non-empty list of years", isValid: isYearList },
  { field: "retrievedAt", expectation: "an ISO date of the download", isValid: isIsoDate },
  {
    field: "license",
    expectation:
      "{ condition, credit }: condition from LICENSE_CONDITIONS (several joined by a semicolon) and a filled credit",
    isValid: isLicense,
  },
  {
    field: "rawSha256",
    expectation: "a map from bare raw file names to SHA-256 hashes",
    isValid: isRawHashMap,
  },
]);

/**
 * DAD-01: a source has exactly 645 seven-digit codes, none repeated.
 * @param {string} sourceName
 * @param {string[]} codes
 * @returns {string[]}
 */
export function checkSourceCodes(sourceName, codes) {
  const problems = [];
  const malformed = codes.filter((code) => !MUNICIPALITY_CODE.test(code));
  const repeated = findRepeated(codes);
  if (malformed.length > 0) {
    problems.push(`DAD-01: ${sourceName} has codes that are not 7 digits: ${listSome(malformed)}`);
  }
  if (repeated.length > 0) {
    problems.push(`DAD-01: ${sourceName} repeats codes: ${listSome(repeated)}`);
  }
  if (codes.length !== EXPECTED_MUNICIPALITY_COUNT) {
    problems.push(
      `DAD-01: ${sourceName} has ${codes.length} codes, expected ${EXPECTED_MUNICIPALITY_COUNT}`,
    );
  }
  return problems;
}

/**
 * DAD-01: every source carries the same set of codes, so every join is by code.
 * @param {Record<string, string[]>} codesBySource
 * @returns {string[]}
 */
export function checkSameCodeSets(codesBySource) {
  const sources = Object.entries(codesBySource);
  if (sources.length === 0) return [];
  const [[referenceName, referenceCodes], ...others] = sources;
  const reference = new Set(referenceCodes);
  return others.flatMap(([sourceName, codes]) => {
    const current = new Set(codes);
    const missing = referenceCodes.filter((code) => !current.has(code));
    const extra = codes.filter((code) => !reference.has(code));
    if (missing.length === 0 && extra.length === 0) return [];
    return [
      `DAD-01: ${sourceName} differs from ${referenceName}: missing ${listSome(missing)}; extra ${listSome(extra)}`,
    ];
  });
}

/**
 * DAD-02: every municipality belongs to exactly one known region and no region is empty.
 * @param {RegionMembership[]} rows
 * @param {readonly string[]} [regionCodes]
 * @returns {string[]}
 */
export function checkRegionMembership(rows, regionCodes = EXPECTED_REGION_CODES) {
  const regionsByCode = groupValues(
    rows,
    (row) => row.code,
    (row) => row.regionCode,
  );
  const municipalityProblems = [...regionsByCode].flatMap(([code, regions]) =>
    describeMembership(code, regions, regionCodes),
  );
  const filledRegions = new Set(rows.map((row) => row.regionCode));
  const emptyRegionProblems = regionCodes
    .filter((regionCode) => !filledRegions.has(regionCode))
    .map((regionCode) => `DAD-02: region ${regionCode} is empty`);
  return [...municipalityProblems, ...emptyRegionProblems];
}

/**
 * DAD-02: every region has exactly one label.
 * @param {RegionLabelRow[]} rows
 * @returns {string[]}
 */
export function checkRegionLabels(rows) {
  const withRegion = rows.filter((row) => row.regionCode !== null);
  const labelsByRegion = groupValues(
    withRegion,
    (row) => String(row.regionCode),
    (row) => row.regionLabel,
  );
  return [...labelsByRegion].flatMap(([regionCode, labels]) => {
    if (labels.has(null) || labels.has("")) return [`DAD-02: region ${regionCode} has no label`];
    if (labels.size > 1) {
      return [`DAD-02: region ${regionCode} has more than one label: ${listSome([...labels])}`];
    }
    return [];
  });
}

/**
 * RGV-01: every municipality belongs to exactly one known Government Region and no Government Region is empty.
 * @param {{ code: string, governmentRegionCode: string | null }[]} rows
 * @param {readonly string[]} [expectedCodes]
 * @returns {string[]}
 */
export function checkGovernmentRegionMembership(
  rows,
  expectedCodes = EXPECTED_GOVERNMENT_REGION_CODES,
) {
  const regionsByMunicipality = groupValues(
    rows,
    (row) => row.code,
    (row) => row.governmentRegionCode,
  );
  const municipalityProblems = [...regionsByMunicipality].flatMap(([code, regions]) =>
    describeGovernmentRegionMembership(code, regions, expectedCodes),
  );
  const filledRegions = new Set(rows.map((row) => row.governmentRegionCode));
  const emptyRegionProblems = expectedCodes
    .filter((regionCode) => !filledRegions.has(regionCode))
    .map((regionCode) => `RGV-01: government region ${regionCode} is empty`);
  return [...municipalityProblems, ...emptyRegionProblems];
}

/**
 * RGV-01: every Government Region has exactly one label.
 * @param {{ governmentRegionCode: string | null, governmentRegionName: string | null }[]} rows
 * @returns {string[]}
 */
export function checkGovernmentRegionLabels(rows) {
  const withRegion = rows.filter((row) => row.governmentRegionCode !== null);
  const labelsByRegion = groupValues(
    withRegion,
    (row) => String(row.governmentRegionCode),
    (row) => row.governmentRegionName,
  );
  return [...labelsByRegion].flatMap(([regionCode, labels]) => {
    if (labels.has(null) || labels.has("")) {
      return [`RGV-01: government region ${regionCode} has no label`];
    }
    if (labels.size > 1) {
      return [
        `RGV-01: government region ${regionCode} has more than one label: ${listSome([...labels])}`,
      ];
    }
    return [];
  });
}

/**
 * RGV-02: every Government Region fits entirely inside exactly one Administrative Region (RA).
 * Strict hierarchy: Municipality -> RG -> RA.
 * @param {{ code: string, governmentRegionCode: string }[]} geoseadeRows
 * @param {{ code: string, regionCode: string | null }[]} seadeRows
 * @returns {string[]}
 */
export function checkHierarchyStrictness(geoseadeRows, seadeRows) {
  const raByMunicipality = new Map(seadeRows.map((row) => [row.code, row.regionCode]));
  /** @type {Map<string, Set<string>>} */
  const raByGovernmentRegion = new Map();

  for (const row of geoseadeRows) {
    const raCode = raByMunicipality.get(row.code);
    if (!raCode) {
      continue;
    }
    const current = raByGovernmentRegion.get(row.governmentRegionCode) ?? new Set();
    current.add(raCode);
    raByGovernmentRegion.set(row.governmentRegionCode, current);
  }

  const problems = [];
  for (const [rgCode, raSet] of raByGovernmentRegion.entries()) {
    if (raSet.size > 1) {
      problems.push(
        `RGV-02: government region ${rgCode} is split across multiple administrative regions: ${listSome([...raSet])}`,
      );
    }
  }
  return problems;
}

/**
 * RGV-02: group codes do not collide between levels (e.g. municipality, governmentRegion, region).
 * @param {Record<string, (string | null | undefined)[]>} codesByLevel
 * @returns {string[]}
 */
export function checkGroupCodeCollision(codesByLevel) {
  const levels = Object.entries(codesByLevel);
  const problems = [];

  for (let i = 0; i < levels.length; i += 1) {
    const [levelA, codesA] = levels[i];
    const setA = new Set(codesA.filter((c) => typeof c === "string" && c.length > 0));
    for (let j = i + 1; j < levels.length; j += 1) {
      const [levelB, codesB] = levels[j];
      const colliding = codesB.filter((code) => typeof code === "string" && setA.has(code));
      if (colliding.length > 0) {
        problems.push(
          `RGV-02: code collision between levels "${levelA}" and "${levelB}": ${listSome([...new Set(colliding)])}`,
        );
      }
    }
  }

  return problems;
}

/**
 * RGV-02: RM São Paulo (RA code "1") territorially coincides with its Government Region ("RG de São Paulo", "rg-40").
 * @param {{ code: string, governmentRegionCode: string, governmentRegionName?: string }[]} geoseadeRows
 * @param {{ code: string, regionCode: string | null }[]} seadeRows
 * @returns {string[]}
 */
export function checkMetropolitanRegionCoincidence(geoseadeRows, seadeRows) {
  const rmSpCodes = new Set(
    seadeRows.filter((row) => row.regionCode === "1").map((row) => row.code),
  );
  const rgSpCodes = new Set(
    geoseadeRows
      .filter((row) => isRgSaoPaulo(row))
      .map((row) => row.code),
  );

  const missingInRg = [...rmSpCodes].filter((code) => !rgSpCodes.has(code));
  const extraInRg = [...rgSpCodes].filter((code) => !rmSpCodes.has(code));

  if (missingInRg.length === 0 && extraInRg.length === 0) {
    return [];
  }

  return [
    `RGV-02: RM São Paulo and RG de São Paulo do not coincide territorially: missing in RG: ${listSome(missingInRg)}; extra in RG: ${listSome(extraInRg)}`,
  ];
}

/**
 * DAD-03: the population of the 16 regions adds up to the state population, to the inhabitant.
 * @param {PopulationRecord[]} municipalities
 * @param {number | null | undefined} statePopulation
 * @returns {string[]}
 */
export function checkStatePopulation(municipalities, statePopulation) {
  if (typeof statePopulation !== "number" || !Number.isFinite(statePopulation)) {
    return ["DAD-03: the state population is missing from SIDRA 4714"];
  }
  const inRegions = municipalities.filter((municipality) =>
    EXPECTED_REGION_CODES.includes(String(municipality.regionCode)),
  );
  const withoutPopulation = inRegions.filter((municipality) => municipality.population === null);
  if (withoutPopulation.length > 0) {
    return [`DAD-03: population missing for ${withoutPopulation.length} municipalities`];
  }
  const regionSum = inRegions.reduce(
    (total, municipality) => total + Number(municipality.population),
    0,
  );
  if (regionSum === statePopulation) return [];
  return [
    `DAD-03: the 16 regions add up to ${regionSum} inhabitants, the state has ${statePopulation}`,
  ];
}

/**
 * DAD-04: polygons only, every arc used by 1 or 2 geometries, no geometry left without a
 * non-empty ring after quantization.
 * @param {Topology} topology
 * @returns {string[]}
 */
export function checkMeshTopology(topology) {
  const collection = topology.objects.municipalities;
  if (!collection) return ["DAD-04: the mesh has no municipalities collection"];
  const typeProblems = collection.geometries
    .filter((geometry) => !MESH_GEOMETRY_TYPES.includes(geometry.type))
    .map((geometry) => `DAD-04: geometry ${geometry.id} is ${geometry.type}, not a polygon`);
  const validation = validateTopology(topology);
  if (validation.valid) return typeProblems;
  return [
    ...typeProblems,
    `DAD-04: arc usage min ${validation.minArcUsage}, max ${validation.maxArcUsage} (expected 1 or 2); geometries without a non-empty ring: ${validation.emptyRingCount}`,
  ];
}

/**
 * DAD-05: meta carries source, URL, year, download date, license condition and the SHA-256
 * of every raw file, named relative to scripts/data/raw/.
 * @param {Record<string, unknown>} meta
 * @returns {string[]}
 */
export function checkMeta(meta) {
  return META_RULES.filter((rule) => !rule.isValid(meta[rule.field])).map(
    (rule) => `DAD-05: meta.${rule.field} must be ${rule.expectation}`,
  );
}

/**
 * DAD-06: no value is negative or NaN; an absent value is null.
 * @param {Record<string, unknown>[]} municipalities
 * @returns {string[]}
 */
export function checkValues(municipalities) {
  return municipalities.flatMap((municipality) =>
    NUMERIC_FIELDS.flatMap((field) => {
      const problem = describeValueProblem(municipality[field]);
      if (problem === null) return [];
      return [`DAD-06: ${municipality.code} ${field} ${problem}`];
    }),
  );
}

/**
 * DAD-07: a stored municipality has exactly the six fields; density and GDP per capita are
 * computed by the domain, never stored.
 * @param {Record<string, unknown>[]} municipalities
 * @returns {string[]}
 */
export function checkRecordShape(municipalities) {
  return municipalities.flatMap((municipality) => {
    const fields = Object.keys(municipality);
    const extra = fields.filter((field) => !MUNICIPALITY_FIELDS.includes(field));
    const missing = MUNICIPALITY_FIELDS.filter((field) => !fields.includes(field));
    if (extra.length === 0 && missing.length === 0) return [];
    return [
      `DAD-07: ${municipality.code} has extra fields [${extra.join(", ")}] and lacks [${missing.join(", ")}]`,
    ];
  });
}

/**
 * @param {string} code
 * @param {Set<string | null>} regions
 * @param {readonly string[]} regionCodes
 * @returns {string[]}
 */
function describeMembership(code, regions, regionCodes) {
  if (regions.has(null) || regions.has("")) return [`DAD-02: municipality ${code} has no region`];
  if (regions.size > 1) {
    return [`DAD-02: municipality ${code} has more than one region: ${listSome([...regions])}`];
  }
  const unknown = [...regions].filter((regionCode) => !regionCodes.includes(String(regionCode)));
  if (unknown.length > 0) return [`DAD-02: municipality ${code} has unknown region ${unknown[0]}`];
  return [];
}

/**
 * @param {string} code
 * @param {Set<string | null>} regions
 * @param {readonly string[]} expectedCodes
 * @returns {string[]}
 */
function describeGovernmentRegionMembership(code, regions, expectedCodes) {
  if (regions.has(null) || regions.has("")) {
    return [`RGV-01: municipality ${code} has no government region`];
  }
  if (regions.size > 1) {
    return [
      `RGV-01: municipality ${code} has more than one government region: ${listSome([...regions])}`,
    ];
  }
  const unknown = [...regions].filter((regionCode) => !expectedCodes.includes(String(regionCode)));
  if (unknown.length > 0) {
    return [`RGV-01: municipality ${code} has unknown government region ${unknown[0]}`];
  }
  return [];
}

/**
 * @param {{ governmentRegionCode: string, governmentRegionName?: string }} row
 * @returns {boolean}
 */
function isRgSaoPaulo(row) {
  if (row.governmentRegionCode === "rg-40") {
    return true;
  }
  if (row.governmentRegionName !== undefined && row.governmentRegionName.includes("São Paulo")) {
    return true;
  }
  return false;
}

/**
 * @param {unknown} value
 * @returns {string | null} What is wrong with the value, or null when it is fine.
 */
function describeValueProblem(value) {
  if (value === null) return null;
  if (typeof value !== "number") return "is not a number (an absent value must be null)";
  if (Number.isNaN(value)) return "is NaN";
  if (!Number.isFinite(value)) return "is not finite";
  if (value < 0) return "is negative";
  return null;
}

/**
 * @template T, V
 * @param {T[]} items
 * @param {(item: T) => string} readKey
 * @param {(item: T) => V} readValue
 * @returns {Map<string, Set<V>>} Distinct values per key.
 */
function groupValues(items, readKey, readValue) {
  /** @type {Map<string, Set<V>>} */
  const groups = new Map();
  for (const item of items) {
    const key = readKey(item);
    const values = groups.get(key) ?? /** @type {Set<V>} */ (new Set());
    values.add(readValue(item));
    groups.set(key, values);
  }
  return groups;
}

/**
 * @param {string[]} values
 * @returns {string[]}
 */
function findRepeated(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

/**
 * @param {unknown[]} values
 * @returns {string}
 */
function listSome(values) {
  const shown = values.slice(0, LISTED_EXAMPLES).map((value) => String(value));
  if (values.length > LISTED_EXAMPLES) shown.push(`and ${values.length - LISTED_EXAMPLES} more`);
  return `[${shown.join(", ")}]`;
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isUrlList(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((url) => typeof url === "string" && url.startsWith("https://"));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isYearList(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((year) => Number.isInteger(year) && year >= 1900 && year <= 2100);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isIsoDate(value) {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isLicense(value) {
  if (!isRecord(value)) return false;
  return isLicenseCondition(value.condition) && isNonEmptyText(value.credit);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isLicenseCondition(value) {
  if (!isNonEmptyText(value)) return false;
  return value.split(LICENSE_CONDITION_SEPARATOR).every(isKnownLicenseCondition);
}

/**
 * @param {string} condition
 * @returns {boolean}
 */
function isKnownLicenseCondition(condition) {
  return KNOWN_LICENSE_CONDITIONS.includes(condition);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isRawHashMap(value) {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  if (entries.length === 0) return false;
  return entries.every(
    ([file, hash]) =>
      BARE_FILE_NAME.test(file) && typeof hash === "string" && SHA256_HEX.test(hash),
  );
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
