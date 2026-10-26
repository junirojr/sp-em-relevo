/**
 * Builds data/mesh.topo.json, data/municipalities.json and data/regions.json from the raw files
 * in scripts/data/raw/ (downloaded by fetch-sources.mjs). Every join is by IBGE code; names come
 * from SIDRA 4714 (R1) and a different name in another source is only a warning. The build fails,
 * writing nothing, when any rule from DAD-01 to DAD-07 breaks. Same raw files, same bytes.
 *
 * Usage: node scripts/data/build-data.mjs [--quality minima|intermediaria]
 *
 * @typedef {import("../../src/domain/topology.js").Topology} Topology
 * @typedef {import("./read-sidra.js").SidraValue} SidraValue
 * @typedef {import("./read-seade.js").SeadeRow} SeadeRow
 * @typedef {import("./read-geoseade.js").GeoseadeRow} GeoseadeRow
 * @typedef {import("./sources.js").RawSource} RawSource
 * @typedef {{ sha256: string, retrievedAt: string }} RawChecksum
 * @typedef {{ bytes: Map<string, Uint8Array>, checksums: Record<string, RawChecksum> }} RawFiles
 * @typedef {{ type: string, id?: string, arcs: number[][] | number[][][], properties?: Record<string, unknown> }} SourceGeometry
 * @typedef {{ type: "Topology", transform?: Topology["transform"], objects: Record<string, { type: string, geometries: SourceGeometry[] }>, arcs: Topology["arcs"] }} SourceTopology
 * @typedef {{ population: SidraValue[], area: SidraValue[], gdp: SidraValue[], statePopulation: number | null | undefined, seadeRows: SeadeRow[], geoseadeRows: GeoseadeRow[], meshes: Record<string, SourceTopology> }} Inputs
 * @typedef {{ code: string, name: string, regionCode: string | null, governmentRegionCode: string | null, governmentRegionName: string | null, population: number | null, areaKm2: number | null, gdpThousandBrl: number | null }} MunicipalityRecord
 * @typedef {{ code: string, label: string }} RegionRecord
 * @typedef {{ condition: string, credit: string, notice?: string }} DataLicense
 * @typedef {{ source: string, sourceUrl: string[], year: number[], retrievedAt: string, license: DataLicense, rawSha256: Record<string, string> }} DataMeta
 * @typedef {{ type: "Topology", meta: DataMeta, transform?: Topology["transform"], objects: Topology["objects"], arcs: Topology["arcs"] }} MeshDocument
 * @typedef {{ "mesh.topo.json": MeshDocument, "municipalities.json": { schemaVersion: number, columns: string[], rows: unknown[][], meta: DataMeta, municipalities?: MunicipalityRecord[] }, "regions.json": { meta: DataMeta, regions: RegionRecord[], governmentRegions: RegionRecord[] } }} Documents
 * @typedef {{ quality: string, warnings: string[], meshBytes: Record<string, number>, statePopulation: number | null | undefined, files: string[] }} BuildSummary
 */

import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import {
  checkGovernmentRegionLabels,
  checkGovernmentRegionMembership,
  checkGroupCodeCollision,
  checkHierarchyStrictness,
  checkMeshTopology,
  checkMeta,
  checkMetropolitanRegionCoincidence,
  checkRecordShape,
  checkRegionLabels,
  checkRegionMembership,
  checkSameCodeSets,
  checkSourceCodes,
  checkStatePopulation,
  checkValues,
} from "./data-checks.js";
import { projectTopology } from "./project.js";
import { readGeoseadeRows } from "./read-geoseade.js";
import { readSeadeRows } from "./read-seade.js";
import { readSidraRows, selectValue, selectValues } from "./read-sidra.js";
import {
  CENSUS_SOURCE,
  CHECKSUMS_FILE,
  DEFAULT_MESH_QUALITY,
  GDP_SOURCE,
  GEOSEADE_SOURCE,
  MESH_QUALITIES,
  MESH_SOURCES,
  MUNICIPALITY_LEVEL,
  RAW_SOURCES,
  REGION_SOURCE,
  SIDRA_VARIABLES,
  STATE_CODE,
  STATE_LEVEL,
} from "./sources.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const RAW_DIR = path.join(scriptDir, "raw");
export const DATA_DIR = path.resolve(scriptDir, "..", "..", "data");
const MESH_FILE = "mesh.topo.json";
const MUNICIPALITIES_FILE = "municipalities.json";
const REGIONS_FILE = "regions.json";

if (isMainModule()) await runCli();

/**
 * @param {{ rawDir?: string, outDir?: string, quality?: string }} [options]
 * @returns {Promise<BuildSummary>}
 */
export async function buildData({
  rawDir = RAW_DIR,
  outDir = DATA_DIR,
  quality = DEFAULT_MESH_QUALITY,
} = {}) {
  if (!MESH_QUALITIES.includes(quality)) {
    throw new Error(`Unknown mesh quality "${quality}"; use ${MESH_QUALITIES.join(" or ")}`);
  }
  const raw = await readRawFiles(rawDir);
  const inputs = parseInputs(raw);
  const meshDocuments = createMeshDocuments(inputs.meshes, raw);
  const meshTexts = serializeMeshes(meshDocuments);
  const documents = createDocuments(inputs, raw, meshDocuments[quality]);
  const problems = collectProblems(inputs, documents, quality);
  if (problems.length > 0) {
    throw new Error(`Data checks failed:\n${problems.join("\n")}`);
  }
  const texts = {
    [MESH_FILE]: meshTexts[quality],
    [MUNICIPALITIES_FILE]: serializeCompact({
      ...documents[MUNICIPALITIES_FILE],
      municipalities: undefined,
    }),
    [REGIONS_FILE]: serializeCompact(documents[REGIONS_FILE]),
  };
  await writeOutputs(outDir, texts);
  await writeFile(path.join(outDir, "mesh.topo.json.gz"), gzipSync(texts[MESH_FILE], { level: 9 }));
  return {
    quality,
    warnings: findNameMismatches(inputs),
    meshBytes: measureBytes(meshTexts),
    statePopulation: inputs.statePopulation,
    files: Object.keys(texts),
  };
}

async function runCli() {
  const { values } = parseArgs({
    options: { quality: { type: "string", default: DEFAULT_MESH_QUALITY } },
  });
  try {
    printSummary(await buildData({ quality: values.quality }));
  } catch (error) {
    console.error(describeError(error));
    process.exitCode = 1;
  }
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describeError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** @returns {boolean} */
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return realpathSync(entry) === fileURLToPath(import.meta.url);
}

/**
 * @param {BuildSummary} summary
 */
function printSummary(summary) {
  for (const warning of summary.warnings) console.warn(warning);
  for (const [quality, bytes] of Object.entries(summary.meshBytes)) {
    console.log(`mesh ${quality}: ${bytes} bytes`);
  }
  console.log(`chosen mesh quality: ${summary.quality}`);
  console.log(`state population (SIDRA 4714): ${summary.statePopulation}, equal to the 16 regions`);
  console.log(`wrote ${summary.files.map((file) => `data/${file}`).join(", ")}`);
}

/**
 * Reads every raw file and checks it against the SHA-256 recorded at download time.
 * @param {string} rawDir
 * @returns {Promise<RawFiles>}
 */
async function readRawFiles(rawDir) {
  const checksums = JSON.parse(await readFile(path.join(rawDir, CHECKSUMS_FILE), "utf8"));
  const entries = await Promise.all(
    RAW_SOURCES.map((source) => readVerifiedRawFile(rawDir, source.file, checksums)),
  );
  return { bytes: new Map(entries), checksums };
}

/**
 * @param {string} rawDir
 * @param {string} file
 * @param {Record<string, RawChecksum>} checksums
 * @returns {Promise<[string, Uint8Array]>}
 */
async function readVerifiedRawFile(rawDir, file, checksums) {
  const recorded = checksums[file];
  if (!recorded) {
    throw new Error(`${file} is not listed in ${CHECKSUMS_FILE}; run npm run data:fetch`);
  }
  const bytes = await readFile(path.join(rawDir, file));
  if (sha256(bytes) !== recorded.sha256) {
    throw new Error(
      `${file} does not match its SHA-256 in ${CHECKSUMS_FILE}; run npm run data:fetch`,
    );
  }
  return [file, bytes];
}

/**
 * @param {RawFiles} raw
 * @returns {Inputs}
 */
function parseInputs(raw) {
  const censusRows = readSidraRows(readText(raw, CENSUS_SOURCE));
  const gdpRows = readSidraRows(readText(raw, GDP_SOURCE));
  const municipal = { level: MUNICIPALITY_LEVEL };
  return {
    population: selectValues(censusRows, { ...municipal, variable: SIDRA_VARIABLES.population }),
    area: selectValues(censusRows, { ...municipal, variable: SIDRA_VARIABLES.areaKm2 }),
    gdp: selectValues(gdpRows, { ...municipal, variable: SIDRA_VARIABLES.gdpThousandBrl }),
    statePopulation: selectValue(censusRows, {
      level: STATE_LEVEL,
      variable: SIDRA_VARIABLES.population,
      code: STATE_CODE,
    }),
    seadeRows: readSeadeRows(readBytes(raw, REGION_SOURCE)),
    geoseadeRows: readGeoseadeRows(readBytes(raw, GEOSEADE_SOURCE)),
    meshes: Object.fromEntries(
      MESH_QUALITIES.map((quality) => [quality, JSON.parse(readText(raw, MESH_SOURCES[quality]))]),
    ),
  };
}

/**
 * Every quality is built, so the build can report the bytes of each one.
 * @param {Record<string, SourceTopology>} meshes
 * @param {RawFiles} raw
 * @returns {Record<string, MeshDocument>}
 */
function createMeshDocuments(meshes, raw) {
  return Object.fromEntries(
    MESH_QUALITIES.map((quality) => [quality, createMeshDocument(meshes[quality], quality, raw)]),
  );
}

/**
 * The mesh stays compact: it is the largest file the page downloads.
 * @param {Record<string, MeshDocument>} meshDocuments
 * @returns {Record<string, string>}
 */
function serializeMeshes(meshDocuments) {
  return Object.fromEntries(
    Object.entries(meshDocuments).map(([quality, mesh]) => [quality, `${JSON.stringify(mesh)}\n`]),
  );
}

/**
 * @param {Inputs} inputs
 * @param {RawFiles} raw
 * @param {MeshDocument} mesh
 * @returns {Documents}
 */
function createDocuments(inputs, raw, mesh) {
  const municipalities = joinMunicipalities(inputs);
  const columns = [
    "code",
    "name",
    "regionCode",
    "governmentRegionCode",
    "governmentRegionName",
    "population",
    "areaKm2",
    "gdpThousandBrl",
  ];
  const rows = municipalities.map((m) => [
    m.code,
    m.name,
    m.regionCode,
    m.governmentRegionCode,
    m.governmentRegionName,
    m.population,
    m.areaKm2,
    m.gdpThousandBrl,
  ]);
  const municipalityDocument = {
    schemaVersion: 1,
    columns,
    rows,
    municipalities,
    meta: createMeta([CENSUS_SOURCE, GDP_SOURCE, REGION_SOURCE, GEOSEADE_SOURCE], raw),
  };

  return {
    [MESH_FILE]: mesh,
    [MUNICIPALITIES_FILE]: municipalityDocument,
    [REGIONS_FILE]: {
      meta: createMeta([REGION_SOURCE, GEOSEADE_SOURCE], raw),
      regions: collectRegions(inputs.seadeRows),
      governmentRegions: collectGovernmentRegions(inputs.geoseadeRows),
    },
  };
}

/**
 * @param {Inputs} inputs
 * @param {Documents} documents
 * @param {string} quality
 * @returns {string[]}
 */
function collectProblems(inputs, documents, quality) {
  const mesh = documents[MESH_FILE];
  const municipalities = /** @type {any} */ (documents[MUNICIPALITIES_FILE]).municipalities;
  const codesBySource = {
    "SIDRA 4714 population": inputs.population.map((value) => value.code),
    "SIDRA 4714 area": inputs.area.map((value) => value.code),
    "SIDRA 5938": inputs.gdp.map((value) => value.code),
    Seade: inputs.seadeRows.map((row) => row.code),
    Geoseade: inputs.geoseadeRows.map((row) => row.code),
    [`mesh ${quality}`]: readMeshCodes(mesh),
  };
  return [
    ...Object.entries(codesBySource).flatMap(([source, codes]) => checkSourceCodes(source, codes)),
    ...checkSameCodeSets(codesBySource),
    ...checkRegionMembership(inputs.seadeRows),
    ...checkRegionLabels(inputs.seadeRows),
    ...checkGovernmentRegionMembership(inputs.geoseadeRows),
    ...checkGovernmentRegionLabels(inputs.geoseadeRows),
    ...checkHierarchyStrictness(inputs.geoseadeRows, inputs.seadeRows),
    ...checkGroupCodeCollision({
      municipality: inputs.population.map((value) => value.code),
      governmentRegion: inputs.geoseadeRows.map((row) => row.governmentRegionCode),
      region: inputs.seadeRows.map((row) => row.regionCode),
    }),
    ...checkMetropolitanRegionCoincidence(inputs.geoseadeRows, inputs.seadeRows),
    ...checkStatePopulation(municipalities, inputs.statePopulation),
    ...checkMeshTopology(mesh),
    ...Object.values(documents).flatMap((document) => checkMeta(document.meta)),
    ...checkValues(municipalities),
    ...checkRecordShape(municipalities),
  ];
}

/**
 * Names come from SIDRA 4714 (R1); Seade and SIDRA 5938 are compared only to warn.
 * @param {Inputs} inputs
 * @returns {string[]}
 */
function findNameMismatches(inputs) {
  const censusNames = new Map(inputs.population.map((value) => [value.code, value.name]));
  /** @type {[string, { code: string, name: string }[]][]} */
  const others = [
    ["Seade", inputs.seadeRows],
    ["SIDRA 5938", inputs.gdp],
  ];
  return others.flatMap(([source, rows]) =>
    rows
      .filter((row) => censusNames.has(row.code) && censusNames.get(row.code) !== row.name)
      .map(
        (row) =>
          `R1: ${row.code} is "${censusNames.get(row.code)}" in SIDRA 4714 and "${row.name}" in ${source}`,
      ),
  );
}

/**
 * @param {Record<string, string>} texts
 * @returns {Record<string, number>}
 */
function measureBytes(texts) {
  return Object.fromEntries(
    Object.entries(texts).map(([key, text]) => [key, Buffer.byteLength(text, "utf8")]),
  );
}

/**
 * @param {string} outDir
 * @param {Record<string, string>} texts
 */
async function writeOutputs(outDir, texts) {
  await mkdir(outDir, { recursive: true });
  for (const [file, text] of Object.entries(texts)) {
    await writeFile(path.join(outDir, file), text, "utf8");
  }
}

/**
 * Projected mesh (R3) with only type, id and arcs on each geometry, ordered by code.
 * @param {SourceTopology} source
 * @param {string} quality
 * @param {RawFiles} raw
 * @returns {MeshDocument}
 */
function createMeshDocument(source, quality, raw) {
  const projected = projectTopology(source);
  const geometries = readSourceGeometries(source)
    .map((geometry) => ({
      type: geometry.type,
      id: readGeometryCode(geometry),
      arcs: geometry.arcs,
    }))
    .sort((left, right) => compareText(left.id, right.id));
  return {
    type: "Topology",
    meta: createMeta([MESH_SOURCES[quality]], raw),
    transform: projected.transform,
    objects: { municipalities: { type: "GeometryCollection", geometries } },
    arcs: projected.arcs,
  };
}

/**
 * Joins the sources by code, ordered by code; an absent value is null.
 * @param {Inputs} inputs
 * @returns {MunicipalityRecord[]}
 */
function joinMunicipalities(inputs) {
  const regionByCode = new Map(inputs.seadeRows.map((row) => [row.code, row.regionCode]));
  const geoseadeByCode = new Map(inputs.geoseadeRows.map((row) => [row.code, row]));
  const areaByCode = indexValues(inputs.area);
  const gdpByCode = indexValues(inputs.gdp);
  return [...inputs.population]
    .sort((left, right) => compareText(left.code, right.code))
    .map((census) => {
      const geo = geoseadeByCode.get(census.code);
      return {
        code: census.code,
        name: census.name,
        regionCode: regionByCode.get(census.code) ?? null,
        governmentRegionCode: geo?.governmentRegionCode ?? null,
        governmentRegionName: geo?.governmentRegionName ?? null,
        population: census.value,
        areaKm2: areaByCode.get(census.code) ?? null,
        gdpThousandBrl: gdpByCode.get(census.code) ?? null,
      };
    });
}

/**
 * The regions present in the Seade file, label from Seade (P46), ordered by numeric code.
 * @param {SeadeRow[]} rows
 * @returns {RegionRecord[]}
 */
function collectRegions(rows) {
  /** @type {Map<string, string>} */
  const labels = new Map();
  for (const row of rows) {
    if (row.regionCode === null || row.regionLabel === null) continue;
    if (labels.has(row.regionCode)) continue;
    labels.set(row.regionCode, row.regionLabel);
  }
  return [...labels]
    .map(([code, label]) => ({ code, label }))
    .sort((left, right) => Number(left.code) - Number(right.code));
}

/**
 * The 43 Government Regions present in the Geoseade file, ordered by numeric suffix (1..43).
 * @param {GeoseadeRow[]} rows
 * @returns {RegionRecord[]}
 */
function collectGovernmentRegions(rows) {
  /** @type {Map<string, string>} */
  const labels = new Map();
  for (const row of rows) {
    if (!row.governmentRegionCode || !row.governmentRegionName) {
      continue;
    }
    if (labels.has(row.governmentRegionCode)) {
      continue;
    }
    labels.set(row.governmentRegionCode, row.governmentRegionName);
  }
  return [...labels]
    .map(([code, label]) => ({ code, label }))
    .sort((left, right) => compareNumericSuffix(left.code, right.code));
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function compareNumericSuffix(left, right) {
  const leftNum = Number(left.replace(/\D+/g, ""));
  const rightNum = Number(right.replace(/\D+/g, ""));
  return leftNum - rightNum;
}

/**
 * @param {readonly RawSource[]} sources
 * @param {RawFiles} raw
 * @returns {DataMeta}
 */
function createMeta(sources, raw) {
  const retrievals = sources.map((source) => raw.checksums[source.file].retrievedAt);
  const files = sources.map((source) => source.file).sort(compareText);
  return {
    source: sources.map((source) => source.source).join("; "),
    sourceUrl: sources.map((source) => source.url),
    year: [...new Set(sources.map((source) => source.year))].sort((left, right) => left - right),
    retrievedAt: retrievals.sort(compareText)[retrievals.length - 1],
    license: createLicense(sources),
    rawSha256: Object.fromEntries(files.map((file) => [file, raw.checksums[file].sha256])),
  };
}

/**
 * One entry per distinct condition, credit and notice among the sources of the file. The notice
 * is present only when some source asks for one.
 * @param {readonly RawSource[]} sources
 * @returns {DataLicense}
 */
function createLicense(sources) {
  const license = {
    condition: joinDistinct(sources.map((source) => source.licenseCondition)),
    credit: joinDistinct(sources.map((source) => source.credit)),
  };
  const notices = sources.flatMap((source) => collectNotice(source));
  if (notices.length === 0) return license;
  return { ...license, notice: joinDistinct(notices) };
}

/**
 * @param {RawSource} source
 * @returns {string[]} the notice of the source, or nothing.
 */
function collectNotice(source) {
  if (source.licenseNotice === undefined) return [];
  return [source.licenseNotice];
}

/**
 * @param {string[]} texts
 * @returns {string}
 */
function joinDistinct(texts) {
  return [...new Set(texts)].join("; ");
}

/**
 * @param {MeshDocument} mesh
 * @returns {string[]}
 */
function readMeshCodes(mesh) {
  return mesh.objects.municipalities.geometries.map((geometry) => String(geometry.id));
}

/**
 * The IBGE topology has a single collection (named after the state, such as UF35MU).
 * @param {SourceTopology} source
 * @returns {SourceGeometry[]}
 */
function readSourceGeometries(source) {
  const collections = Object.values(source.objects);
  if (collections.length !== 1) {
    throw new Error(`The IBGE mesh should hold one collection, found ${collections.length}`);
  }
  return collections[0].geometries;
}

/**
 * @param {SourceGeometry} geometry
 * @returns {string}
 */
function readGeometryCode(geometry) {
  const code = geometry.properties?.codarea;
  if (code !== undefined) return String(code);
  return String(geometry.id);
}

/**
 * @param {SidraValue[]} values
 * @returns {Map<string, number | null>}
 */
function indexValues(values) {
  return new Map(values.map((value) => [value.code, value.value]));
}

/**
 * Writes without indentation: the files count toward the page weight (PUB-04).
 * @param {unknown} document
 * @returns {string}
 */
function serializeCompact(document) {
  return `${JSON.stringify(document)}\n`;
}

/**
 * @param {RawFiles} raw
 * @param {RawSource} source
 * @returns {Uint8Array}
 */
function readBytes(raw, source) {
  const bytes = raw.bytes.get(source.file);
  if (!bytes) throw new Error(`Raw file ${source.file} was not read`);
  return bytes;
}

/**
 * UTF-8 text without byte order mark.
 * @param {RawFiles} raw
 * @param {RawSource} source
 * @returns {string}
 */
function readText(raw, source) {
  return new TextDecoder("utf-8").decode(readBytes(raw, source));
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Locale independent text order, so the output never depends on the machine.
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
