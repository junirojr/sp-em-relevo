import { DEFAULT_INDICATOR_ID, isValidIndicator } from "../features/indicator/indicator-slice.js";
import { LEVEL_MUNICIPALITY, LEVEL_REGION } from "../features/level/level-slice.js";

/**
 * URL state synchronization.
 * Follows IND-07 and R9.
 *
 * @typedef {{ indicatorId: string, levelId: string }} UrlState
 */

const INDICATOR_PARAM = "indicador";
const LEVEL_PARAM = "ver";

/**
 * Parses indicator and territorial level from query parameters.
 * Falls back safely to defaults for missing or invalid parameters.
 *
 * @param {string | URL | Location} [locationOrSearch]
 * @returns {UrlState}
 */
export function parseUrlState(locationOrSearch = "") {
  const searchParams = extractSearchParams(locationOrSearch);

  const rawIndicator = searchParams.get(INDICATOR_PARAM);
  let indicatorId = DEFAULT_INDICATOR_ID;
  if (rawIndicator && isValidIndicator(rawIndicator)) {
    indicatorId = rawIndicator;
  }

  const rawLevel = searchParams.get(LEVEL_PARAM);
  let levelId = LEVEL_MUNICIPALITY;
  if (rawLevel && isValidLevel(rawLevel)) {
    levelId = rawLevel;
  }

  return { indicatorId, levelId };
}

/**
 * Synchronizes application state to URL via history.replaceState so history.length does not grow.
 * Does not write demo parameters when demo mode is active.
 *
 * @param {Window} windowRef
 * @param {{ indicatorId: string, levelId: string, isDemoActive?: boolean }} state
 */
export function syncUrlState(windowRef, state) {
  if (!windowRef?.history?.replaceState) {
    return;
  }

  const url = new URL(windowRef.location.href);

  if (state.indicatorId && isValidIndicator(state.indicatorId)) {
    url.searchParams.set(INDICATOR_PARAM, state.indicatorId);
  }
  if (!state.indicatorId || !isValidIndicator(state.indicatorId)) {
    url.searchParams.delete(INDICATOR_PARAM);
  }

  if (state.levelId && isValidLevel(state.levelId)) {
    url.searchParams.set(LEVEL_PARAM, state.levelId);
  }
  if (!state.levelId || !isValidLevel(state.levelId)) {
    url.searchParams.delete(LEVEL_PARAM);
  }

  // Never write demo parameters to URL (IND-07)
  url.searchParams.delete("demo");

  const nextPath = `${url.pathname}${url.search}${url.hash}`;
  windowRef.history.replaceState(null, "", nextPath);
}

/**
 * @param {string | URL | Location} input
 * @returns {URLSearchParams}
 */
function extractSearchParams(input) {
  if (!input) {
    return new URLSearchParams("");
  }
  if (typeof input === "string") {
    if (input.includes("?")) {
      const queryString = input.slice(input.indexOf("?"));
      return new URLSearchParams(queryString);
    }
    return new URLSearchParams(input);
  }
  if ("search" in input && typeof input.search === "string") {
    return new URLSearchParams(input.search);
  }
  return new URLSearchParams("");
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isValidLevel(id) {
  return id === LEVEL_MUNICIPALITY || id === LEVEL_REGION;
}
