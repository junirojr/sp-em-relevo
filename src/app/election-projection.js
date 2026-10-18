import {
  BASE_HEIGHT,
  DEFAULT_EXAGGERATION,
} from "../domain/height.js";
import {
  assignCandidateColors,
  getElectionNeutrals,
} from "../domain/election-colors.js";
import {
  aggregateElectionUnits,
  computeElectionHeight,
  computeUnitElectionResult,
  isBelowSectionsThreshold,
} from "../domain/election.js";
import {
  buildElectionCompareModel,
  computeDisplayedMarginPp,
  formatCandidateMargin,
  formatCandidateShare,
  resolveCalculationBase,
  resolveOfficeLabel,
} from "../features/election/election-compare-model.js";
import { findElectionSearchResults } from "../features/election/election-search-model.js";
import { buildElectionTableModel } from "../features/election/election-table-model.js";

/**
 * Election projection mapping domain electoral results to engine height targets and color positions (N13, ELE-04, ELE-05, ELE-06, ELE-10, ELE-12, ELE-15).
 *
 * Implements:
 * - ELE-04 / E32: Continuous linear height scale with fixed domain [0, 100] pp
 * - ELE-05 / E31: Municipalities below 50% counted sections show leader color with height at base
 * - ELE-06: Isolated per-municipality state updates
 * - ELE-10: Color lightness and chroma parity between leaders
 * - ELE-12: Zero lift elevation for hover and selection in election tabs
 * - ELE-15: Selected units preserve candidate/party color without blue overlay
 *
 * @typedef {import("../domain/election.js").ElectionUnitResult} ElectionUnitResult
 * @typedef {import("../domain/election.js").ElectionRoundMode} ElectionRoundMode
 * @typedef {import("../domain/election-colors.js").ThemeMode} ThemeMode
 * @typedef {import("../domain/territory.js").MunicipalityRecord} MunicipalityRecord
 *
 * @typedef {{
 *   municipalities: readonly MunicipalityRecord[],
 *   municipalResults: Record<string, ElectionUnitResult>,
 *   mode?: ElectionRoundMode,
 *   theme?: ThemeMode,
 *   minHeight?: number,
 *   exaggeration?: number,
 *   heightMode?: "data" | "flat"
 * }} ElectionProjectionInputs
 *
 * @typedef {{
 *   heightTargets: Float32Array,
 *   colorPositions: Uint8Array,
 *   paletteColors: string[],
 *   hexColors: string[]
 * }} ElectionProjectionOutputs
 */

/**
 * Projects electoral results across all municipalities to engine heights and colors.
 *
 * @param {ElectionProjectionInputs} inputs
 * @returns {ElectionProjectionOutputs}
 */
export function projectElectionToEngine(inputs) {
  const municipalities = inputs.municipalities ?? [];
  const results = inputs.municipalResults ?? {};
  const mode = inputs.mode ?? "live";
  const theme = inputs.theme ?? "dark";
  const minHeight = inputs.minHeight ?? BASE_HEIGHT;
  const exaggeration = inputs.exaggeration ?? DEFAULT_EXAGGERATION;
  const heightMode = inputs.heightMode ?? "data";

  const neutrals = getElectionNeutrals(theme);
  const count = municipalities.length;

  const heightTargets = new Float32Array(count);
  const hexColors = new Array(count);

  /** @type {Set<string>} */
  const uniqueColorsSet = new Set();
  uniqueColorsSet.add(neutrals.noResult);
  uniqueColorsSet.add(neutrals.tie);
  uniqueColorsSet.add(neutrals.others);

  for (let i = 0; i < count; i += 1) {
    const mun = municipalities[i];
    const unitResult = results[mun.code];

    if (!unitResult || unitResult.status === "no-result") {
      heightTargets[i] = minHeight;
      hexColors[i] = neutrals.noResult;
      continue;
    }

    if (unitResult.status === "tie") {
      heightTargets[i] = minHeight;
      hexColors[i] = neutrals.tie;
      continue;
    }

    // Leader state
    const leaderColor = unitResult.leaderColor ?? neutrals.noResult;
    hexColors[i] = leaderColor;
    uniqueColorsSet.add(leaderColor);

    if (heightMode === "flat") {
      heightTargets[i] = minHeight;
      continue;
    }

    // ELE-05, E31: Municipalities below 50% threshold get leader color and height at base
    const belowThreshold = isBelowSectionsThreshold({
      sectionsCounted: unitResult.sectionsCounted,
      sectionsTotal: unitResult.sectionsTotal,
      mode,
    });

    if (belowThreshold) {
      heightTargets[i] = minHeight;
      continue;
    }

    // ELE-04, E32: Linear height 0 to 100 pp
    heightTargets[i] = computeElectionHeight(unitResult.marginPp, {
      minHeight,
      exaggeration,
      heightMode,
    });
  }

  const paletteColors = Array.from(uniqueColorsSet);
  /** @type {Map<string, number>} */
  const colorIndexMap = new Map();
  for (let idx = 0; idx < paletteColors.length; idx += 1) {
    colorIndexMap.set(paletteColors[idx], idx);
  }

  const colorPositions = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const hex = hexColors[i];
    const pos = colorIndexMap.get(hex);
    if (pos !== undefined) {
      colorPositions[i] = pos;
    }
    if (pos === undefined) {
      colorPositions[i] = 0;
    }
  }

  return {
    heightTargets,
    colorPositions,
    paletteColors,
    hexColors,
  };
}

/**
 * Configures the engine for election tab mode (ELE-12, ELE-15).
 * Disables hover elevation and selection elevation (elevation 0).
 *
 * @param {any} engine
 * @param {boolean} isElection
 */
export function applyElectionEngineSettings(engine, isElection) {
  if (!engine) {
    return;
  }
  if (typeof engine.setLiftEnabled === "function") {
    if (isElection) {
      // ELE-12: Zero elevation on hover and selection
      engine.setLiftEnabled({ pointed: false, selected: false });
      return;
    }
    engine.setLiftEnabled({ pointed: true, selected: true });
  }
}

/**
 * Projects the active election selection for panel display (ELE-11, ELE-22, TUR-04).
 *
 * @param {readonly string[]} selectedCodes
 * @param {Record<string, ElectionUnitResult | ElectionUnitInput> | Map<string, ElectionUnitResult | ElectionUnitInput>} municipalResults
 * @param {{
 *   office?: string,
 *   theme?: ThemeMode,
 *   territory?: any,
 *   level?: string,
 *   isDeputyFreeSelection?: boolean
 * }} [options]
 * @returns {any | null}
 */
export function projectElectionSelection(selectedCodes, municipalResults, options = {}) {
  if (!selectedCodes || selectedCodes.length === 0) {
    return null;
  }

  const office = options.office ?? "presidente";
  const officeLabel = resolveOfficeLabel(office);
  const calculationBase = resolveCalculationBase(office);
  const lookupMap = toLookupMap(municipalResults);

  if (selectedCodes.length === 1) {
    const code = selectedCodes[0];
    const raw = lookupMap.get(code) || { code, name: code };
    const res = computeUnitElectionResult(raw, options);

    const leaderPctNum = res.leader?.sharePct ?? 0;
    const secondPctNum = res.candidates[1]?.sharePct ?? 0;
    const marginPp = computeDisplayedMarginPp(leaderPctNum, secondPctNum);

    return {
      ...res,
      office,
      officeLabel,
      calculationBase,
      marginPp,
      formattedMargin: formatCandidateMargin(marginPp),
      leaderPct: formatCandidateShare(leaderPctNum),
      secondPct: formatCandidateShare(secondPctNum),
      count: 1,
    };
  }

  // Multi-selection aggregation (ELE-03, TUR-04)
  const childInputs = [];
  for (let i = 0; i < selectedCodes.length; i += 1) {
    const code = selectedCodes[i];
    const data = lookupMap.get(code) || { code, name: code };
    childInputs.push(data);
  }

  const agg = aggregateElectionUnits(childInputs, {
    ...options,
    code: "selection-aggregate",
    name: `${selectedCodes.length} municipios selecionados`,
    isDeputyFreeSelection: options.isDeputyFreeSelection,
  });

  const leaderPctNum = agg.leader?.sharePct ?? 0;
  const secondPctNum = agg.candidates[1]?.sharePct ?? 0;
  const marginPp = computeDisplayedMarginPp(leaderPctNum, secondPctNum);

  return {
    ...agg,
    office,
    officeLabel,
    calculationBase,
    marginPp,
    formattedMargin: formatCandidateMargin(marginPp),
    leaderPct: formatCandidateShare(leaderPctNum),
    secondPct: formatCandidateShare(secondPctNum),
    count: selectedCodes.length,
  };
}

/**
 * Projects a side-by-side comparison for two territorial units in election mode (ELE-11, ELE-22).
 *
 * @param {[
 *   { code: string, name?: string },
 *   { code: string, name?: string }
 * ]} pair
 * @param {Record<string, any> | Map<string, any>} municipalResults
 * @param {any} [options]
 * @returns {any}
 */
export function projectElectionComparison(pair, municipalResults, options = {}) {
  return buildElectionCompareModel(pair, municipalResults, options);
}

/**
 * Projects election search results for query (ELE-22, RGV-03).
 *
 * @param {string} query
 * @param {any[]} entries
 * @param {Record<string, any> | Map<string, any>} municipalResults
 * @param {any} [options]
 * @returns {any}
 */
export function projectElectionSearch(query, entries, municipalResults, options = {}) {
  return findElectionSearchResults({
    query,
    entries,
    electionLookup: municipalResults,
    ...options,
  });
}

/**
 * Projects alternative table model in election mode (ACE-02, RGV-03).
 *
 * @param {any[]} municipalities
 * @param {Record<string, any> | Map<string, any>} municipalResults
 * @param {any} [options]
 * @returns {any}
 */
export function projectElectionTable(municipalities, municipalResults, options = {}) {
  return buildElectionTableModel({
    municipalities,
    electionUnits: municipalResults,
    ...options,
  });
}

/**
 * @param {any} input
 * @returns {Map<string, any>}
 */
function toLookupMap(input) {
  if (!input) {
    return new Map();
  }
  if (input instanceof Map) {
    return input;
  }
  const map = new Map();
  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i += 1) {
      const item = input[i];
      if (item && item.code) {
        map.set(item.code, item);
      }
    }
    return map;
  }
  if (typeof input === "object") {
    const keys = Object.keys(input);
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      map.set(k, input[k]);
    }
  }
  return map;
}
