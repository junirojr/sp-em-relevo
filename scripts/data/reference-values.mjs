#!/usr/bin/env node
// Independent oracle for the NIV-05 fixture.
// Reads only the raw files in scripts/data/raw/ and uses node: built-ins only.
// It must not import from scripts/data/*.js, data/ or src/domain/.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

/**
 * @typedef {{ code: string, population: number, areaKm2: number, density: number, gdpPerCapita: number }} FixtureRegion
 * @typedef {{ regions: FixtureRegion[], governmentRegions: FixtureRegion[] }} FixtureData
 * @typedef {{ municipalityCode: string, regionCode: string, regionLabel: string }} MembershipEntry
 * @typedef {{ NC: string, D1C: string, D2C: string, D3C: string, V: string }} SidraRow
 * @typedef {{ variable: string, year: string }} Selector
 * @typedef {Map<string, number>} ValuesByCode
 * @typedef {{ population: ValuesByCode, areaThousandths: ValuesByCode, gdpThousands: ValuesByCode }} Sources
 * @typedef {Record<string, { sha256?: string }>} Checksums
 */

class ReferenceValuesError extends Error {}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(SCRIPT_DIR, "raw");
const FIXTURE_PATH = join(
  SCRIPT_DIR,
  "..",
  "..",
  "src",
  "domain",
  "fixtures",
  "region-reference.json",
);
const FIXTURE_LABEL = "src/domain/fixtures/region-reference.json";

const CHECKSUMS_FILE = "checksums.json";
const REGION_MEMBERSHIP_FILE = "seade-codigos-municipios-regioes.csv";
const POPULATION_AND_AREA_FILE = "sidra-4714.json";
const GDP_FILE = "sidra-5938.json";
const GEOSEADE_FILE = "limite_municipal.zip";

const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const DBF_HEADER_VERSION = 0x03;
const DBF_HEADER_TERMINATOR = 0x0d;
const DEFLATE_COMPRESSION_METHOD = 8;
const EXPECTED_GOVERNMENT_REGION_COUNT = 43;

const MUNICIPALITY_LEVEL = "6";
const STATE_PLACEHOLDER_CODE = "3500000";
const MUNICIPALITY_CODE_PATTERN = /^\d{7}$/;
const WHOLE_NUMBER_PATTERN = /^\d+$/;
const AREA_PATTERN = /^\d+(\.\d{1,3})?$/;
const TARGET_REGION_LABELS = ["RM São Paulo", "RA Santos", "RA Registro"];
/** @type {Array<keyof FixtureRegion>} */
const FIXTURE_FIELDS = ["code", "population", "areaKm2", "density", "gdpPerCapita"];

const POPULATION_SELECTOR = { variable: "93", year: "2022" };
const AREA_SELECTOR = { variable: "6318", year: "2022" };
const GDP_SELECTOR = { variable: "37", year: "2023" };

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
function main(argv) {
  const data = buildFixtureData();
  if (argv.includes("--check")) {
    return checkFixture(data);
  }
  writeFixture(data);
  console.log(
    `wrote ${data.regions.length} regions and ${data.governmentRegions.length} government regions to ${FIXTURE_LABEL}`,
  );
  return 0;
}

/**
 * @param {FixtureData} data
 * @returns {number} exit code
 */
function checkFixture(data) {
  const stored = readStoredData();
  const regionDivergence = findDivergence(data.regions, stored.regions, "regions");
  if (regionDivergence !== undefined) {
    console.error(`fixture diverges from raw data at ${regionDivergence}`);
    return 1;
  }
  const govDivergence = findDivergence(
    data.governmentRegions,
    stored.governmentRegions,
    "governmentRegions",
  );
  if (govDivergence !== undefined) {
    console.error(`fixture diverges from raw data at ${govDivergence}`);
    return 1;
  }
  console.log("fixture matches raw data");
  return 0;
}

/** @returns {FixtureData} */
function buildFixtureData() {
  const checksums = readChecksums();
  const membership = parseRegionMembership(readVerifiedRaw(REGION_MEMBERSHIP_FILE, checksums));
  const populationAndAreaRows = parseSidraRows(
    readVerifiedRaw(POPULATION_AND_AREA_FILE, checksums),
  );
  const gdpRows = parseSidraRows(readVerifiedRaw(GDP_FILE, checksums));
  const geoseadeZip = readVerifiedRaw(GEOSEADE_FILE, checksums);
  const dbfBuffer = extractDbfBuffer(geoseadeZip);
  const governmentRegionMap = parseGovernmentRegionMembership(dbfBuffer);

  const sources = {
    population: indexMunicipalValues(populationAndAreaRows, POPULATION_SELECTOR, parseWholeNumber),
    areaThousandths: indexMunicipalValues(
      populationAndAreaRows,
      AREA_SELECTOR,
      parseAreaThousandths,
    ),
    gdpThousands: indexMunicipalValues(gdpRows, GDP_SELECTOR, parseWholeNumber),
  };

  const regions = TARGET_REGION_LABELS.map((label) => buildRegion(label, membership, sources)).sort(
    compareByNumericCode,
  );
  const governmentRegions = buildGovernmentRegions(governmentRegionMap, sources);

  return { regions, governmentRegions };
}

/**
 * @param {string} label
 * @param {MembershipEntry[]} membership
 * @param {Sources} sources
 * @returns {FixtureRegion}
 */
function buildRegion(label, membership, sources) {
  const regionCode = resolveRegionCode(membership, label);
  const municipalityCodes = membership
    .filter((entry) => entry.regionCode === regionCode)
    .map((entry) => entry.municipalityCode);
  const population = sumValues(municipalityCodes, sources.population);
  const areaKm2 = sumValues(municipalityCodes, sources.areaThousandths) / 1000;
  const gdpReais = sumValues(municipalityCodes, sources.gdpThousands) * 1000;
  return {
    code: regionCode,
    population,
    areaKm2,
    density: population / areaKm2,
    gdpPerCapita: gdpReais / population,
  };
}

/**
 * @param {Map<string, string[]>} governmentRegionMap
 * @param {Sources} sources
 * @returns {FixtureRegion[]}
 */
function buildGovernmentRegions(governmentRegionMap, sources) {
  const regions = [];
  for (let i = 1; i <= EXPECTED_GOVERNMENT_REGION_COUNT; i += 1) {
    const code = `rg-${i}`;
    const municipalityCodes = governmentRegionMap.get(code);
    if (!municipalityCodes || municipalityCodes.length === 0) {
      throw new ReferenceValuesError(`empty or missing government region: ${code}`);
    }
    const population = sumValues(municipalityCodes, sources.population);
    const areaKm2 = sumValues(municipalityCodes, sources.areaThousandths) / 1000;
    const gdpReais = sumValues(municipalityCodes, sources.gdpThousands) * 1000;
    regions.push({
      code,
      population,
      areaKm2,
      density: population / areaKm2,
      gdpPerCapita: gdpReais / population,
    });
  }
  return regions;
}

/**
 * @param {string} label
 * @param {MembershipEntry[]} membership
 * @returns {string}
 */
function resolveRegionCode(membership, label) {
  const codes = new Set(
    membership.filter((entry) => entry.regionLabel === label).map((entry) => entry.regionCode),
  );
  if (codes.size !== 1) {
    throw new ReferenceValuesError(`region label must map to exactly one code: ${label}`);
  }
  return [...codes][0];
}

/**
 * @param {string[]} municipalityCodes
 * @param {ValuesByCode} valuesByCode
 * @returns {number}
 */
function sumValues(municipalityCodes, valuesByCode) {
  return municipalityCodes.reduce((total, code) => total + requireValue(valuesByCode, code), 0);
}

/**
 * @param {ValuesByCode} valuesByCode
 * @param {string} municipalityCode
 * @returns {number}
 */
function requireValue(valuesByCode, municipalityCode) {
  const value = valuesByCode.get(municipalityCode);
  if (value === undefined) {
    throw new ReferenceValuesError(`no value for municipality ${municipalityCode}`);
  }
  return value;
}

/**
 * @param {SidraRow[]} rows
 * @param {Selector} selector
 * @param {(text: string) => number} parseValue
 * @returns {ValuesByCode}
 */
function indexMunicipalValues(rows, selector, parseValue) {
  const valuesByCode = new Map();
  for (const row of rows) {
    if (!isSelectedMunicipalRow(row, selector)) {
      continue;
    }
    addMunicipalValue(valuesByCode, row, parseValue);
  }
  return valuesByCode;
}

/**
 * @param {SidraRow} row
 * @param {Selector} selector
 * @returns {boolean}
 */
function isSelectedMunicipalRow(row, selector) {
  return (
    row.NC === MUNICIPALITY_LEVEL && row.D2C === selector.variable && row.D3C === selector.year
  );
}

/**
 * @param {ValuesByCode} valuesByCode
 * @param {SidraRow} row
 * @param {(text: string) => number} parseValue
 */
function addMunicipalValue(valuesByCode, row, parseValue) {
  if (valuesByCode.has(row.D1C)) {
    throw new ReferenceValuesError(`duplicate municipality row: ${row.D1C}`);
  }
  valuesByCode.set(row.D1C, parseValue(row.V));
}

/**
 * @param {Buffer} bytes
 * @returns {MembershipEntry[]}
 */
function parseRegionMembership(bytes) {
  const lines = bytes.toString("latin1").split(/\r?\n/).slice(1);
  return lines.filter(isMunicipalityLine).map(parseMembershipLine);
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isMunicipalityLine(line) {
  const municipalityCode = line.split(";")[0];
  if (municipalityCode === STATE_PLACEHOLDER_CODE) {
    return false;
  }
  return MUNICIPALITY_CODE_PATTERN.test(municipalityCode);
}

/**
 * @param {string} line
 * @returns {MembershipEntry}
 */
function parseMembershipLine(line) {
  const fields = line.split(";");
  return {
    municipalityCode: fields[0],
    regionCode: fields[3],
    regionLabel: normalizeLabel(fields[4]),
  };
}

/**
 * Extracts LimiteMunicipal.dbf buffer from raw zip or dbf buffer.
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
function extractDbfBuffer(buffer) {
  if (buffer.length < 4) {
    throw new ReferenceValuesError("Geoseade input buffer is too small");
  }
  const signature = buffer.readUInt32LE(0);
  if (signature !== ZIP_LOCAL_FILE_SIGNATURE) {
    if (buffer[0] === DBF_HEADER_VERSION) {
      return buffer;
    }
    throw new ReferenceValuesError(
      "Geoseade input is neither a valid ZIP archive nor a valid DBF file",
    );
  }

  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== ZIP_LOCAL_FILE_SIGNATURE) {
      break;
    }
    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const fileName = buffer.toString("utf8", offset + 30, offset + 30 + fileNameLength);
    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

    if (fileName.toLowerCase().endsWith(".dbf")) {
      const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === DEFLATE_COMPRESSION_METHOD) {
        return inflateRawSync(compressedData);
      }
      return Buffer.from(compressedData);
    }

    offset = dataOffset + compressedSize;
  }

  throw new ReferenceValuesError("No .dbf file found inside the Geoseade ZIP archive");
}

/**
 * @param {Buffer} dbfBuffer
 * @returns {Map<string, string[]>}
 */
function parseGovernmentRegionMembership(dbfBuffer) {
  if (dbfBuffer.length < 32) {
    throw new ReferenceValuesError("DBF buffer too small for header");
  }
  const numRecords = dbfBuffer.readUInt32LE(4);
  const headerLength = dbfBuffer.readUInt16LE(8);
  const recordLength = dbfBuffer.readUInt16LE(10);

  const fields = [];
  let offset = 32;
  const maxDescriptorOffset = headerLength - 1;
  while (offset < maxDescriptorOffset) {
    if (dbfBuffer[offset] === DBF_HEADER_TERMINATOR) {
      break;
    }
    const rawName = dbfBuffer.toString("ascii", offset, offset + 11);
    const nullIndex = rawName.indexOf("\0");
    let name = rawName;
    if (nullIndex >= 0) {
      name = rawName.slice(0, nullIndex);
    }
    fields.push({ name: name.trim(), len: dbfBuffer[offset + 16] });
    offset += 32;
  }

  /** @type {Map<string, string[]>} */
  const rgMap = new Map();
  for (let recordIndex = 0; recordIndex < numRecords; recordIndex += 1) {
    const recordStart = headerLength + recordIndex * recordLength;
    if (recordStart + recordLength > dbfBuffer.length) {
      break;
    }
    if (dbfBuffer[recordStart] === 0x2a) {
      continue;
    }

    let fieldOffset = recordStart + 1;
    /** @type {Record<string, string>} */
    const record = {};
    for (const field of fields) {
      record[field.name] = dbfBuffer.toString("utf8", fieldOffset, fieldOffset + field.len).trim();
      fieldOffset += field.len;
    }

    const code = record.Cod_ibge ?? "";
    const gidRg = record.GID_RG ?? "";
    if (!MUNICIPALITY_CODE_PATTERN.test(code) || !WHOLE_NUMBER_PATTERN.test(gidRg)) {
      continue;
    }

    const rgCode = `rg-${gidRg}`;
    const list = rgMap.get(rgCode) ?? [];
    list.push(code);
    rgMap.set(rgCode, list);
  }

  return rgMap;
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeLabel(text) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * @param {Buffer} bytes
 * @returns {SidraRow[]}
 */
function parseSidraRows(bytes) {
  return JSON.parse(bytes.toString("utf8").replace(/^﻿/, ""));
}

/**
 * @param {string} text
 * @returns {number}
 */
function parseWholeNumber(text) {
  if (!WHOLE_NUMBER_PATTERN.test(text)) {
    throw new ReferenceValuesError(`missing or invalid whole number: ${text}`);
  }
  return Number(text);
}

/**
 * @param {string} text
 * @returns {number} area in thousandths of km2
 */
function parseAreaThousandths(text) {
  if (!AREA_PATTERN.test(text)) {
    throw new ReferenceValuesError(`missing or invalid area: ${text}`);
  }
  return Math.round(Number(text) * 1000);
}

/** @returns {FixtureData} */
function readStoredData() {
  if (!existsSync(FIXTURE_PATH)) {
    throw new ReferenceValuesError(`fixture not found: ${FIXTURE_LABEL}`);
  }
  const parsed = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  return {
    regions: parsed.regions ?? [],
    governmentRegions: parsed.governmentRegions ?? [],
  };
}

/**
 * @param {FixtureRegion[]} expectedRegions
 * @param {FixtureRegion[]} storedRegions
 * @param {string} label
 * @returns {string | undefined} location of the first divergent field
 */
function findDivergence(expectedRegions, storedRegions, label) {
  if (!Array.isArray(storedRegions)) {
    return `${label} is missing or not an array`;
  }
  if (expectedRegions.length !== storedRegions.length) {
    return `${label}.length`;
  }
  for (const [index, expected] of expectedRegions.entries()) {
    const field = FIXTURE_FIELDS.find((name) => expected[name] !== storedRegions[index]?.[name]);
    if (field !== undefined) {
      return `${label}[${index}] (code ${expected.code}).${field}`;
    }
  }
  return undefined;
}

/**
 * @param {FixtureData} data
 */
function writeFixture(data) {
  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/**
 * @param {FixtureRegion} a
 * @param {FixtureRegion} b
 * @returns {number}
 */
function compareByNumericCode(a, b) {
  return Number(a.code) - Number(b.code);
}

/** @returns {Checksums} */
function readChecksums() {
  return JSON.parse(readRaw(CHECKSUMS_FILE).toString("utf8"));
}

/**
 * @param {string} fileName
 * @param {Checksums} checksums
 * @returns {Buffer}
 */
function readVerifiedRaw(fileName, checksums) {
  const bytes = readRaw(fileName);
  const expected = checksums[fileName]?.sha256;
  if (expected === undefined) {
    throw new ReferenceValuesError(`no checksum recorded for: ${fileName}`);
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    throw new ReferenceValuesError(`checksum mismatch for: ${fileName}`);
  }
  return bytes;
}

/**
 * @param {string} fileName
 * @returns {Buffer}
 */
function readRaw(fileName) {
  const filePath = join(RAW_DIR, fileName);
  if (!existsSync(filePath)) {
    throw new ReferenceValuesError(`raw file not found: ${fileName}`);
  }
  return readFileSync(filePath);
}

/**
 * @param {any} error
 * @returns {string}
 */
function describeFailure(error) {
  if (error instanceof ReferenceValuesError) {
    return error.message;
  }
  return `unexpected failure: ${error?.code ?? error?.name}`;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(describeFailure(error));
  process.exitCode = 1;
}
