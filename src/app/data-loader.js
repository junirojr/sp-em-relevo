/**
 * List of data assets required by the application runtime.
 * Single source of truth across the app and error scenarios (ERR-02).
 */
export const DATA_FILES = ["data/mesh.topo.json", "data/municipalities.json", "data/regions.json"];

/**
 * @typedef {import("../domain/territory.js").MunicipalityRecord} MunicipalityRecord
 * @typedef {import("../domain/territory.js").RegionRecord} RegionRecord
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
    municipalities: results[1].municipalities,
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
    return await response.json();
  } catch (_error) {
    throw new Error(`JSON corrompido ou truncado em ${url}. Recarregue a página.`);
  }
}
