import { DEFAULT_INDICATOR_ID, isValidIndicator } from "../features/indicator/indicator-slice.js";
import {
  LEVEL_GOVERNMENT_REGION,
  LEVEL_MUNICIPALITY,
  LEVEL_REGION,
} from "../features/level/level-slice.js";
import { resolveAllowedTab } from "./state.js";

/**
 * URL state synchronization.
 * Follows IND-07, ELE-20, E19, R9 and RGV-03.
 *
 * @typedef {import("./state.js").TabId} TabId
 * @typedef {{ indicatorId: string, levelId: string, tab: TabId }} UrlState
 * @typedef {{
 *   now?: Date | string | number,
 *   status?: import("./data-loader.js").OperationalStatus
 * }} ParseUrlOptions
 */

const INDICATOR_PARAM = "indicador";
const LEVEL_PARAM = "ver";
const TAB_PARAM = "aba";

export const ELECTION_DAY_BRT = "2026-10-25";

const TAB_FROM_PARAM = Object.freeze({
  "1turno": "first-round",
  "2turno": "second-round",
  indicadores: "indicators",
});

const PARAM_FROM_TAB = Object.freeze({
  "first-round": "1turno",
  "second-round": "2turno",
});

const LEVEL_FROM_PARAM = Object.freeze({
  municipio: LEVEL_MUNICIPALITY,
  municipality: LEVEL_MUNICIPALITY,
  governo: LEVEL_GOVERNMENT_REGION,
  government: LEVEL_GOVERNMENT_REGION,
  governmentregion: LEVEL_GOVERNMENT_REGION,
  governmentRegion: LEVEL_GOVERNMENT_REGION,
  regiao: LEVEL_REGION,
  region: LEVEL_REGION,
});

const PARAM_FROM_LEVEL = Object.freeze({
  municipality: "municipio",
  governmentRegion: "governo",
  region: "regiao",
});

const BRT_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Parses indicator, territorial level and active tab from query parameters (IND-07, ELE-20, E19, RGV-03).
 * Supports level in URL via ?nivel=municipio, ?nivel=governo, ?nivel=regiao or ?ver=<level>.
 * Falls back safely to defaults for missing or invalid parameters.
 *
 * @param {string | URL | Location} [locationOrSearch]
 * @param {ParseUrlOptions} [options]
 * @returns {UrlState}
 */
export function parseUrlState(locationOrSearch = "", options = {}) {
  const searchParams = extractSearchParams(locationOrSearch);

  const rawIndicator = searchParams.get(INDICATOR_PARAM);
  let indicatorId = DEFAULT_INDICATOR_ID;
  if (rawIndicator && isValidIndicator(rawIndicator)) {
    indicatorId = rawIndicator;
  }

  const rawLevel = searchParams.get("nivel") || searchParams.get(LEVEL_PARAM);
  let levelId = LEVEL_MUNICIPALITY;
  if (rawLevel) {
    const resolvedLevel = resolveLevelFromParam(rawLevel);
    if (resolvedLevel) {
      levelId = resolvedLevel;
    }
  }

  const rawTab = searchParams.get(TAB_PARAM);
  const resolvedTab = parseTabParam(rawTab, options.now);
  const tab = applyStatusToTab(resolvedTab, options.status);

  return { indicatorId, levelId, tab };
}

/**
 * Resolves territorial level id from either English id or Portuguese alias.
 * @param {string} raw
 * @returns {string | null}
 */
function resolveLevelFromParam(raw) {
  if (!raw) {
    return null;
  }
  const key = String(raw).trim().toLowerCase();
  const direct = /** @type {Record<string, string | undefined>} */ (LEVEL_FROM_PARAM)[key];
  if (direct) {
    return direct;
  }
  if (isValidLevel(raw)) {
    return raw;
  }
  return null;
}

/**
 * Resolves the default tab for a given timestamp in `America/Sao_Paulo` timezone (E19, ELE-20).
 * On election day (`2026-10-25` in Brasilia time), defaults to `"second-round"`;
 * on every other date, defaults to `"indicators"`.
 *
 * @param {Date | string | number} [now]
 * @returns {TabId}
 */
export function resolveDefaultTabForDate(now = new Date()) {
  const dateObj = toDate(now);
  if (dateObj === null) {
    return "indicators";
  }
  const formatted = BRT_DATE_FORMATTER.format(dateObj);
  if (formatted === ELECTION_DAY_BRT) {
    return "second-round";
  }
  return "indicators";
}

/**
 * @param {string | null} rawTab
 * @param {Date | string | number | undefined} now
 * @returns {TabId}
 */
function parseTabParam(rawTab, now) {
  if (rawTab === null) {
    return resolveDefaultTabForDate(now);
  }
  const mapped = /** @type {Record<string, TabId | undefined>} */ (TAB_FROM_PARAM)[rawTab];
  if (mapped) {
    return mapped;
  }
  return "indicators";
}

/**
 * @param {TabId} tab
 * @param {import("./data-loader.js").OperationalStatus | undefined} status
 * @returns {TabId}
 */
function applyStatusToTab(tab, status) {
  if (!status) {
    return tab;
  }
  return resolveAllowedTab(tab, status);
}

/**
 * @param {Date | string | number} input
 * @returns {Date | null}
 */
function toDate(input) {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      return null;
    }
    return input;
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

/**
 * Synchronizes application state to URL via history.replaceState so history.length does not grow.
 * Does not write demo parameters when demo mode is active.
 *
 * @param {Window} windowRef
 * @param {{ indicatorId: string, levelId: string, tab?: TabId, isDemoActive?: boolean }} state
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
    if (url.searchParams.has("nivel")) {
      const alias = /** @type {Record<string, string | undefined>} */ (PARAM_FROM_LEVEL)[
        state.levelId
      ];
      if (alias) {
        url.searchParams.set("nivel", alias);
      }
    }
  }
  if (!state.levelId || !isValidLevel(state.levelId)) {
    url.searchParams.delete(LEVEL_PARAM);
    url.searchParams.delete("nivel");
  }

  syncTabSearchParam(url.searchParams, state.tab);

  // Never write demo parameters to URL (IND-07)
  url.searchParams.delete("demo");

  const nextPath = `${url.pathname}${url.search}${url.hash}`;
  windowRef.history.replaceState(null, "", nextPath);
}

/**
 * @param {URLSearchParams} searchParams
 * @param {TabId | undefined} tab
 */
function syncTabSearchParam(searchParams, tab) {
  const paramValue = /** @type {Record<string, string | undefined>} */ (PARAM_FROM_TAB)[tab ?? ""];
  if (paramValue) {
    searchParams.set(TAB_PARAM, paramValue);
    return;
  }
  searchParams.delete(TAB_PARAM);
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
    const withoutHash = input.split("#")[0];
    const questionIndex = withoutHash.indexOf("?");
    if (questionIndex >= 0) {
      return new URLSearchParams(withoutHash.slice(questionIndex));
    }
    if (withoutHash.includes("://") || withoutHash.startsWith("/")) {
      return new URLSearchParams("");
    }
    return new URLSearchParams(withoutHash);
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "search" in input &&
    typeof input.search === "string"
  ) {
    const withoutHash = input.search.split("#")[0];
    return new URLSearchParams(withoutHash);
  }
  return new URLSearchParams("");
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isValidLevel(id) {
  return id === LEVEL_MUNICIPALITY || id === LEVEL_GOVERNMENT_REGION || id === LEVEL_REGION;
}
