/**
 * List of data assets required by the application runtime.
 * Single source of truth across the app and error scenarios (ERR-02).
 */
export const DATA_FILES = [
  "data/mesh.topo.json.gz",
  "data/municipalities.json",
  "data/regions.json",
];

/**
 * Operational status configuration file path (FLG-01, FLG-02).
 */
export const STATUS_FILE = "data/status.json";

const VALID_STATUS_MODES = Object.freeze(["live", "replay", "archived", "disabled"]);

const DEFAULT_FEATURE_FLAGS = Object.freeze({
  election: true,
  electionSecondRound: true,
  indicatorIncome: true,
  indicatorVoterTurnout: true,
  levelGovernmentRegion: true,
  altTable: true,
  pngExport: true,
});

const DEFAULT_REPLAY = Object.freeze({
  available: false,
  path: "data/election/replay-presidente-2t.json",
});

/**
 * Default operational status when status.json is missing or invalid (FLG-02).
 */
export const DEFAULT_STATUS = Object.freeze({
  mode: "live",
  Features: DEFAULT_FEATURE_FLAGS,
  features: DEFAULT_FEATURE_FLAGS,
  replay: DEFAULT_REPLAY,
  updatedAt: null,
});

/**
 * @typedef {import("../domain/territory.js").MunicipalityRecord} MunicipalityRecord
 * @typedef {import("../domain/territory.js").RegionRecord} RegionRecord
 *
 * @typedef {{
 *   election: boolean,
 *   electionSecondRound: boolean,
 *   indicatorIncome: boolean,
 *   indicatorVoterTurnout: boolean,
 *   levelGovernmentRegion: boolean,
 *   altTable: boolean,
 *   pngExport: boolean
 * }} StatusFeatureFlags
 *
 * @typedef {{
 *   available: boolean,
 *   path: string
 * }} StatusReplayConfig
 *
 * @typedef {{
 *   mode: "live" | "replay" | "archived" | "disabled",
 *   Features: StatusFeatureFlags,
 *   features: StatusFeatureFlags,
 *   replay: StatusReplayConfig,
 *   updatedAt: string | null
 * }} OperationalStatus
 *
 * @typedef {{
 *   mesh: any,
 *   municipalities: MunicipalityRecord[],
 *   regions: RegionRecord[]
 * }} ApplicationData
 *
 * @typedef {(file: string) => void} ProgressCallback
 */

/**
 * Reconstructs municipality objects from either the legacy `municipalities` array
 * or the compact columnar format (`columns` + `rows` or named column arrays).
 *
 * @param {any} doc
 * @returns {MunicipalityRecord[]}
 */
export function parseMunicipalities(doc) {
  if (!isPlainObject(doc)) {
    throw new Error("Formato de municipios invalido em data/municipalities.json.");
  }
  if (Array.isArray(doc.municipalities)) {
    return doc.municipalities;
  }
  if (Array.isArray(doc.columns) && Array.isArray(doc.rows)) {
    return reconstructRowsFromTupleColumns(doc.columns, doc.rows);
  }
  if (isPlainObject(doc.columns)) {
    return reconstructRowsFromVectorColumns(doc.columns);
  }
  throw new Error("Formato de municipios invalido em data/municipalities.json.");
}

/**
 * @param {string[]} columns
 * @param {any[][]} rows
 * @returns {MunicipalityRecord[]}
 */
function reconstructRowsFromTupleColumns(columns, rows) {
  const result = [];
  for (const row of rows) {
    /** @type {Record<string, any>} */
    const record = {};
    for (let i = 0; i < columns.length; i += 1) {
      record[columns[i]] = row[i];
    }
    result.push(/** @type {MunicipalityRecord} */ (record));
  }
  return result;
}

/**
 * @param {Record<string, any[]>} columnVectors
 * @returns {MunicipalityRecord[]}
 */
function reconstructRowsFromVectorColumns(columnVectors) {
  const keys = Object.keys(columnVectors);
  if (keys.length === 0) {
    return [];
  }
  const firstVector = columnVectors[keys[0]];
  if (!Array.isArray(firstVector)) {
    throw new Error("Coluna invalida em data/municipalities.json.");
  }
  const rowCount = firstVector.length;
  const result = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    /** @type {Record<string, any>} */
    const record = {};
    for (const key of keys) {
      record[key] = columnVectors[key][rowIndex];
    }
    result.push(/** @type {MunicipalityRecord} */ (record));
  }
  return result;
}

/**
 * Validates a status.json payload against the schema (FLG-02).
 * Returns a list of validation errors (empty array when valid).
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
export function validateStatusSchema(raw) {
  if (!isPlainObject(raw)) {
    return ["status.json root must be a JSON object"];
  }
  const errors = [];
  if (typeof raw.mode !== "string" || !VALID_STATUS_MODES.includes(raw.mode)) {
    errors.push(`Invalid mode: ${String(raw.mode)}`);
  }
  const rawFeatures = readRawFeatures(raw);
  if (!isPlainObject(rawFeatures)) {
    errors.push("Missing Features object in status.json");
  }
  if (isPlainObject(rawFeatures)) {
    for (const key of Object.keys(DEFAULT_FEATURE_FLAGS)) {
      if (typeof rawFeatures[key] !== "boolean") {
        errors.push(`Feature flag ${key} must be boolean`);
      }
    }
  }
  if (!isPlainObject(raw.replay)) {
    errors.push("Missing replay object in status.json");
  }
  if (isPlainObject(raw.replay)) {
    if (typeof raw.replay.available !== "boolean") {
      errors.push("replay.available must be boolean");
    }
    if (typeof raw.replay.path !== "string" || raw.replay.path.trim().length === 0) {
      errors.push("replay.path must be a non-empty string");
    }
  }
  if (typeof raw.updatedAt !== "string" || raw.updatedAt.trim().length === 0) {
    errors.push("updatedAt must be a non-empty ISO string");
  }
  return errors;
}

/**
 * Normalizes any raw status.json input, falling back safely to defaults on missing or invalid fields (FLG-02).
 *
 * @param {unknown} raw
 * @returns {OperationalStatus}
 */
export function normalizeStatus(raw) {
  if (!isPlainObject(raw)) {
    return DEFAULT_STATUS;
  }
  const mode = normalizeMode(raw.mode);
  const rawFeatures = readRawFeatures(raw);
  const features = normalizeFeatureFlags(rawFeatures, mode);
  const replay = normalizeReplay(raw.replay);
  const updatedAt = normalizeUpdatedAt(raw.updatedAt);

  return Object.freeze({
    mode,
    Features: features,
    features,
    replay,
    updatedAt,
  });
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {unknown}
 */
function readRawFeatures(raw) {
  if (isPlainObject(raw.Features)) {
    return raw.Features;
  }
  if (isPlainObject(raw.features)) {
    return raw.features;
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {"live" | "replay" | "archived" | "disabled"}
 */
function normalizeMode(value) {
  if (typeof value === "string" && VALID_STATUS_MODES.includes(value)) {
    return /** @type {"live" | "replay" | "archived" | "disabled"} */ (value);
  }
  return "live";
}

/**
 * @param {unknown} rawFeatures
 * @param {"live" | "replay" | "archived" | "disabled"} mode
 * @returns {StatusFeatureFlags}
 */
function normalizeFeatureFlags(rawFeatures, mode) {
  const source = readPlainObjectOrEmpty(rawFeatures);
  /** @type {Record<string, boolean>} */
  const normalized = {};
  for (const [key, fallback] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
    normalized[key] = readBooleanOrFallback(source[key], fallback);
  }
  if (mode === "disabled") {
    normalized.election = false;
    normalized.electionSecondRound = false;
  }
  return /** @type {StatusFeatureFlags} */ (Object.freeze(normalized));
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function readPlainObjectOrEmpty(value) {
  if (isPlainObject(value)) {
    return value;
  }
  return {};
}

/**
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function readBooleanOrFallback(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

/**
 * @param {unknown} rawReplay
 * @returns {StatusReplayConfig}
 */
function normalizeReplay(rawReplay) {
  if (!isPlainObject(rawReplay)) {
    return DEFAULT_REPLAY;
  }
  const available = readBooleanOrFallback(rawReplay.available, DEFAULT_REPLAY.available);
  /** @type {string} */
  let replayPath = DEFAULT_REPLAY.path;
  if (typeof rawReplay.path === "string" && rawReplay.path.trim().length > 0) {
    replayPath = rawReplay.path.trim();
  }
  return Object.freeze({
    available,
    path: replayPath,
  });
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeUpdatedAt(value) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

/**
 * Loads `data/status.json` with a safe fallback when missing or invalid (FLG-02).
 *
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<OperationalStatus>}
 */
export async function loadStatus(fetchImpl = fetch) {
  try {
    const response = await fetchImpl(STATUS_FILE);
    if (!response || !response.ok) {
      return DEFAULT_STATUS;
    }
    const raw = await response.json();
    return normalizeStatus(raw);
  } catch (_error) {
    return DEFAULT_STATUS;
  }
}

/**
 * Loads all static data files in sequence, reporting progress before each fetch.
 * Follows ERR-01 and ERR-02.
 *
 * @param {typeof fetch} [fetchImpl]
 * @param {ProgressCallback} [onProgress]
 * @returns {Promise<ApplicationData>}
 */
export async function loadData(fetchImpl = fetch, onProgress) {
  const results = [];
  for (const file of DATA_FILES) {
    if (typeof onProgress === "function") {
      onProgress(file);
    }
    const data = await fetchJson(file, fetchImpl);
    results.push(data);
  }

  return {
    mesh: results[0],
    municipalities: parseMunicipalities(results[1]),
    regions: results[2].regions,
  };
}

/**
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<any>}
 */
async function fetchJson(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new Error(
      `Falha de rede ao carregar ${url}: ${/** @type {Error} */ (error).message}. Recarregue a página.`,
    );
  }

  if (!response.ok) {
    throw new Error(`Erro ${response.status} ao carregar ${url}. Recarregue a página.`);
  }

  try {
    if (url.endsWith(".gz")) {
      if (!response.body) throw new Error("Resposta vazia");
      const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
      return await new Response(stream).json();
    }
    return await response.json();
  } catch (_error) {
    throw new Error(`JSON corrompido ou truncado em ${url}. Recarregue a página.`);
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
