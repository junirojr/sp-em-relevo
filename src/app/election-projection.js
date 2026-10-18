import {
  BASE_HEIGHT,
  DEFAULT_EXAGGERATION,
} from "../domain/height.js";
import {
  assignCandidateColors,
  getElectionNeutrals,
} from "../domain/election-colors.js";
import {
  computeElectionHeight,
  isBelowSectionsThreshold,
} from "../domain/election.js";

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
