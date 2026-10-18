/**
 * Level selection slice: toggles viewing data by municipality, government region or administrative region.
 * Follows NIV-01, NIV-08, RGV-03 and RGV-04.
 *
 * @typedef {"municipality" | "governmentRegion" | "region"} LevelId
 * @typedef {{ id: LevelId }} LevelState
 * @typedef {{ type: "level/changed", id: LevelId }} LevelChangedAction
 * @typedef {LevelChangedAction | { type: string }} LevelAction
 */

export const LEVEL_CHANGED = "level/changed";
export const LEVEL_MUNICIPALITY = "municipality";
export const LEVEL_GOVERNMENT_REGION = "governmentRegion";
export const LEVEL_REGION = "region";

/** @type {readonly LevelId[]} */
export const LEVEL_IDS = [LEVEL_MUNICIPALITY, LEVEL_GOVERNMENT_REGION, LEVEL_REGION];

export const LEVEL_OPTIONS = [
  { id: LEVEL_MUNICIPALITY, label: "Município" },
  { id: LEVEL_GOVERNMENT_REGION, label: "Região de governo" },
  { id: LEVEL_REGION, label: "Região administrativa" },
];

/**
 * @param {LevelId} [initialId]
 * @returns {LevelState}
 */
export function createLevelState(initialId = LEVEL_MUNICIPALITY) {
  return { id: initialId };
}

/**
 * @param {LevelId} id
 * @returns {LevelChangedAction}
 */
export function changeLevel(id) {
  return {
    type: LEVEL_CHANGED,
    id,
  };
}

/**
 * Pure reducer for territorial level.
 *
 * @param {LevelState} state
 * @param {LevelAction} action
 * @returns {LevelState}
 */
export function reduceLevel(state, action) {
  if (action.type !== LEVEL_CHANGED) {
    return state;
  }
  const levelAction = /** @type {LevelChangedAction} */ (action);
  if (!isValidLevel(levelAction.id)) {
    return state;
  }
  if (state.id === levelAction.id) {
    return state;
  }
  return { id: levelAction.id };
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isValidLevel(id) {
  return id === LEVEL_MUNICIPALITY || id === LEVEL_GOVERNMENT_REGION || id === LEVEL_REGION;
}

/**
 * @param {LevelState} state
 * @returns {LevelId}
 */
export function selectLevelId(state) {
  return state.id;
}

/**
 * @param {LevelState} state
 * @returns {boolean}
 */
export function selectIsMunicipalityLevel(state) {
  return state.id === LEVEL_MUNICIPALITY;
}

/**
 * @param {LevelState} state
 * @returns {boolean}
 */
export function selectIsGovernmentRegionLevel(state) {
  return state.id === LEVEL_GOVERNMENT_REGION;
}

/**
 * @param {LevelState} state
 * @returns {boolean}
 */
export function selectIsRegionLevel(state) {
  return state.id === LEVEL_REGION;
}
