/**
 * Downloads national and federative unit datasets from IBGE into scripts/data/raw/
 * and updates SHA-256 and retrieval timestamps in scripts/data/raw/checksums.json.
 *
 * Capabilities:
 * - Downloads Brazil 27 UFs mesh to ibge-malha-brasil-ufs.topo.json
 * - Downloads nationwide hierarchy (view=nivelado)
 * - Downloads nationwide Census 2022 (population and area) and GDP 2023
 * - Downloads state-level municipal meshes on-demand (--uf=35 or --uf=SP) or for all (--all)
 *
 * Usage:
 *   node scripts/data/fetch-national.mjs [--core-only] [--uf=35] [--all] [--quality=intermediaria]
 *
 * @typedef {import("./sources-national.js").RawSource} RawSource
 * @typedef {{ sha256: string, retrievedAt: string }} RawChecksum
 * @typedef {{ source: RawSource, bytes: Uint8Array }} Download
 * @typedef {{ quality?: string, uf?: string, all?: boolean, coreOnly?: boolean, rawDir?: string }} FetchNationalOptions
 */

import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CHECKSUMS_FILE } from "./sources.js";
import {
  createUfMeshSource,
  DEFAULT_MESH_QUALITY,
  findUf,
  MESH_QUALITIES,
  NATIONAL_CORE_SOURCES,
  UF_CATALOG,
} from "./sources-national.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const RAW_DIR = path.join(scriptDir, "raw");
const DOWNLOAD_TIMEOUT_MS = 120_000;

if (isMainModule()) {
  await runCli();
}

/**
 * Executes national downloads based on specified options.
 * @param {FetchNationalOptions} [options]
 * @returns {Promise<{ downloaded: string[], checksumsPath: string }>}
 */
export async function fetchNational({
  quality = DEFAULT_MESH_QUALITY,
  uf = "",
  all = false,
  coreOnly = false,
  rawDir = RAW_DIR,
} = {}) {
  if (!MESH_QUALITIES.includes(quality)) {
    throw new Error(`Unknown mesh quality "${quality}"; use ${MESH_QUALITIES.join(" or ")}`);
  }

  const sources = selectSourcesToFetch({ quality, uf, all, coreOnly });
  if (sources.length === 0) {
    throw new Error("No sources selected to download");
  }

  const checksumsPath = path.join(rawDir, CHECKSUMS_FILE);
  const retrievedAt = new Date().toISOString();

  /** @type {Download[]} */
  const downloads = [];
  for (const source of sources) {
    const bytes = await download(source);
    downloads.push({ source, bytes });
    console.log(`downloaded ${source.file}`);
  }

  const previous = await readPreviousChecksums(checksumsPath);
  await mkdir(rawDir, { recursive: true });

  for (const { source, bytes } of downloads) {
    await writeFile(path.join(rawDir, source.file), bytes);
  }

  const updatedChecksums = { ...previous };
  for (const { source, bytes } of downloads) {
    updatedChecksums[source.file] = recordChecksum(bytes, previous[source.file], retrievedAt);
  }

  await writeFile(checksumsPath, serializeChecksums(updatedChecksums), "utf8");
  console.log(`wrote scripts/data/raw/${CHECKSUMS_FILE}`);

  return {
    downloaded: downloads.map((item) => item.source.file),
    checksumsPath,
  };
}

/**
 * Builds the list of RawSources matching the requested options.
 * @param {{ quality: string, uf: string, all: boolean, coreOnly: boolean }} options
 * @returns {RawSource[]}
 */
export function selectSourcesToFetch({ quality, uf, all, coreOnly }) {
  /** @type {Map<string, RawSource>} */
  const sources = new Map();

  for (const source of NATIONAL_CORE_SOURCES) {
    sources.set(source.file, source);
  }

  if (coreOnly) {
    return [...sources.values()];
  }

  if (all) {
    for (const item of UF_CATALOG) {
      const stateSource = createUfMeshSource(item.code, quality);
      sources.set(stateSource.file, stateSource);
    }
    return [...sources.values()];
  }

  const requestedUfs = parseUfList(uf);
  for (const requested of requestedUfs) {
    const info = findUf(requested);
    if (!info) {
      throw new Error(`Unknown UF code or abbreviation: "${requested}"`);
    }
    const stateSource = createUfMeshSource(info.code, quality);
    sources.set(stateSource.file, stateSource);
  }

  return [...sources.values()];
}

/**
 * Splits comma-separated UF strings into trimmed items.
 * @param {string} uf
 * @returns {string[]}
 */
function parseUfList(uf) {
  if (!uf) {
    return [];
  }
  return uf
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Downloads a source with timeout.
 * @param {RawSource} source
 * @returns {Promise<Uint8Array>}
 */
async function download(source) {
  const response = await fetch(source.url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${source.file}: HTTP ${response.status} from ${source.url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Reads existing checksums if the file exists.
 * @param {string} checksumsPath
 * @returns {Promise<Record<string, RawChecksum>>}
 */
async function readPreviousChecksums(checksumsPath) {
  try {
    return JSON.parse(await readFile(checksumsPath, "utf8"));
  } catch (error) {
    if (isMissingFile(error)) {
      return {};
    }
    throw error;
  }
}

/**
 * Retains original download timestamp if content SHA-256 did not change.
 * @param {Uint8Array} bytes
 * @param {RawChecksum | undefined} previous
 * @param {string} retrievedAt
 * @returns {RawChecksum}
 */
function recordChecksum(bytes, previous, retrievedAt) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (previous) {
    if (previous.sha256 === sha256) {
      return previous;
    }
  }
  return { sha256, retrievedAt };
}

/**
 * Deterministic JSON serialization of checksum records sorted by file name.
 * @param {Record<string, RawChecksum>} checksums
 * @returns {string}
 */
function serializeChecksums(checksums) {
  const ordered = Object.keys(checksums)
    .sort()
    .map((file) => [
      file,
      { sha256: checksums[file].sha256, retrievedAt: checksums[file].retrievedAt },
    ]);
  return `${JSON.stringify(Object.fromEntries(ordered), null, 2)}\n`;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isMissingFile(error) {
  if (error instanceof Error) {
    if (Reflect.get(error, "code") === "ENOENT") {
      return true;
    }
  }
  return false;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describeError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** @returns {boolean} */
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return realpathSync(entry) === fileURLToPath(import.meta.url);
}

async function runCli() {
  const { values } = parseArgs({
    options: {
      uf: { type: "string", default: "" },
      all: { type: "boolean", default: false },
      "core-only": { type: "boolean", default: false },
      quality: { type: "string", default: DEFAULT_MESH_QUALITY },
    },
  });

  try {
    const result = await fetchNational({
      quality: values.quality,
      uf: values.uf,
      all: values.all,
      coreOnly: values["core-only"],
    });
    console.log(`Fetched ${result.downloaded.length} source file(s)`);
  } catch (error) {
    console.error(describeError(error));
    process.exitCode = 1;
  }
}
