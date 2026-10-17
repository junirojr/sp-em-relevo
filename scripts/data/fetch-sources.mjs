/**
 * Downloads every raw source listed in sources.js into scripts/data/raw/ and records the
 * SHA-256 and the download moment of each file in scripts/data/raw/checksums.json.
 * Nothing is written until every download succeeds. A file whose bytes did not change keeps
 * its recorded download moment, so fetching again without upstream changes leaves data/ as is.
 * This is the only network step; the build reads the raw files offline.
 *
 * Usage: node scripts/data/fetch-sources.mjs
 *
 * @typedef {import("./sources.js").RawSource} RawSource
 * @typedef {{ sha256: string, retrievedAt: string }} RawChecksum
 * @typedef {{ source: RawSource, bytes: Uint8Array }} Download
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKSUMS_FILE, RAW_SOURCES } from "./sources.js";

const RAW_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "raw");
const CHECKSUMS_PATH = path.join(RAW_DIR, CHECKSUMS_FILE);
const DOWNLOAD_TIMEOUT_MS = 120_000;

try {
  await fetchSources();
} catch (error) {
  console.error(describeError(error));
  process.exitCode = 1;
}

async function fetchSources() {
  const retrievedAt = new Date().toISOString();
  /** @type {Download[]} */
  const downloads = [];
  for (const source of RAW_SOURCES) {
    downloads.push({ source, bytes: await download(source) });
    console.log(`downloaded ${source.file}`);
  }
  const previous = await readPreviousChecksums();
  await mkdir(RAW_DIR, { recursive: true });
  for (const { source, bytes } of downloads) {
    await writeFile(path.join(RAW_DIR, source.file), bytes);
  }
  const checksums = downloads.map(({ source, bytes }) => [
    source.file,
    recordChecksum(bytes, previous[source.file], retrievedAt),
  ]);
  await writeFile(CHECKSUMS_PATH, serializeChecksums(Object.fromEntries(checksums)), "utf8");
  console.log(`wrote scripts/data/raw/${CHECKSUMS_FILE}`);
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function describeError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * @param {RawSource} source
 * @returns {Promise<Uint8Array>}
 */
async function download(source) {
  const response = await fetch(source.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${source.file}: HTTP ${response.status} from ${source.url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * @returns {Promise<Record<string, RawChecksum>>} Empty when nothing was fetched before.
 */
async function readPreviousChecksums() {
  try {
    return JSON.parse(await readFile(CHECKSUMS_PATH, "utf8"));
  } catch (error) {
    if (isMissingFile(error)) return {};
    throw error;
  }
}

/**
 * Same bytes as last time: the earlier download moment still describes this content.
 * @param {Uint8Array} bytes
 * @param {RawChecksum | undefined} previous
 * @param {string} retrievedAt
 * @returns {RawChecksum}
 */
function recordChecksum(bytes, previous, retrievedAt) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (previous && previous.sha256 === sha256) return previous;
  return { sha256, retrievedAt };
}

/**
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
  return error instanceof Error && Reflect.get(error, "code") === "ENOENT";
}
