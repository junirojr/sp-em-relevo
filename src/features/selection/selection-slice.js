import {
  addGovernmentRegion,
  addRegion,
  selectByClassIndex,
  toggleGovernmentRegion,
  toggleMunicipality,
  toggleRegion,
} from "../../domain/selection.js";

/**
 * @typedef {import("../../domain/territory.js").TerritoryIndex} TerritoryIndex
 *
 * @typedef {{
 *   selectedCodes: readonly string[],
 *   selectedClassIndex: number | null,
 *   retentionNotice: string | null
 * }} SelectionState
 *
 * @typedef {{ type: "selection/toggled", code: string }} ToggleMunicipalityAction
 * @typedef {{ type: "selection/regionToggled", regionCode: string, territory: TerritoryIndex }} ToggleRegionAction
 * @typedef {{type: "selection/governmentRegionAdded", governmentRegionCode: string, territory: TerritoryIndex}} AddGovernmentRegionAction
 * @typedef {{ type: "selection/regionAdded", regionCode: string, territory: TerritoryIndex }} AddRegionAction
 * @typedef {{ type: "selection/classChosen", classIndex: number | null, classIndexByCode: Map<string, number> }} SelectClassAction
 * @typedef {{ type: "selection/unitRemoved", codes: readonly string[] }} RemoveCodesAction
 * @typedef {{ type: "selection/cleared" }} ClearSelectionAction
 * @typedef {{ type: "selection/noticeSet", notice: string }} SetNoticeAction
 * @typedef {{ type: "selection/noticeCleared" }} ClearNoticeAction
 * @typedef {ToggleMunicipalityAction | ToggleRegionAction | AddGovernmentRegionAction | AddRegionAction | SelectClassAction | RemoveCodesAction | ClearSelectionAction | SetNoticeAction | ClearNoticeAction | { type: string }} SelectionAction
 */

export const SELECTION_TOGGLED = "selection/toggled";
export const SELECTION_REGION_TOGGLED = "selection/regionToggled";
export const SELECTION_GOVERNMENT_REGION_TOGGLED = "selection/governmentRegionToggled";
export const SELECTION_GOVERNMENT_REGION_ADDED = "selection/governmentRegionAdded";
export const SELECTION_REGION_ADDED = "selection/regionAdded";
export const SELECTION_CLASS_CHOSEN = "selection/classChosen";
export const SELECTION_UNIT_REMOVED = "selection/unitRemoved";
export const SELECTION_CLEARED = "selection/cleared";
export const SELECTION_NOTICE_SET = "selection/noticeSet";
export const SELECTION_NOTICE_CLEARED = "selection/noticeCleared";

/**
 * @returns {SelectionState}
 */
export function createSelectionState() {
  return {
    selectedCodes: [],
    selectedClassIndex: null,
    retentionNotice: null,
  };
}

/**
 * @param {string} code
 * @returns {ToggleMunicipalityAction}
 */
export function toggleMunicipalityAction(code) {
  return {
    type: SELECTION_TOGGLED,
    code,
  };
}

/**
 * @param {string} regionCode
 * @param {TerritoryIndex} territory
 * @returns {ToggleRegionAction}
 */
export function toggleRegionAction(regionCode, territory) {
  return {
    type: SELECTION_REGION_TOGGLED,
    regionCode,
    territory,
  };
}

/**
 * @param {string} governmentRegionCode
 * @param {TerritoryIndex} territory
 * @returns {{ type: string, governmentRegionCode: string, territory: TerritoryIndex }}
 */
export function toggleGovernmentRegionAction(governmentRegionCode, territory) {
  return {
    type: SELECTION_GOVERNMENT_REGION_TOGGLED,
    governmentRegionCode,
    territory,
  };
}

/**
 * @param {string} regionCode
 * @param {TerritoryIndex} territory
 * @returns {AddRegionAction}
 */
export function addRegionAction(regionCode, territory) {
  return {
    type: SELECTION_REGION_ADDED,
    regionCode,
    territory,
  };
}

/**
 * @param {number | null} classIndex
 * @param {Map<string, number>} classIndexByCode
 * @returns {SelectClassAction}
 */
export function selectClassAction(classIndex, classIndexByCode) {
  return {
    type: SELECTION_CLASS_CHOSEN,
    classIndex,
    classIndexByCode,
  };
}

/**
 * @param {readonly string[]} codes
 * @returns {RemoveCodesAction}
 */
export function removeCodesAction(codes) {
  return {
    type: SELECTION_UNIT_REMOVED,
    codes,
  };
}

/**
 * @returns {ClearSelectionAction}
 */
export function clearSelectionAction() {
  return {
    type: SELECTION_CLEARED,
  };
}

/**
 * @param {string} notice
 * @returns {SetNoticeAction}
 */
export function setRetentionNotice(notice) {
  return {
    type: SELECTION_NOTICE_SET,
    notice,
  };
}

/**
 * @returns {ClearNoticeAction}
 */
export function clearRetentionNotice() {
  return {
    type: SELECTION_NOTICE_CLEARED,
  };
}

/**
 * Formats "Seleção mantida: N municípios" (or singular).
 *
 * @param {number} count
 * @returns {string}
 */
export function formatRetentionNotice(count) {
  if (count === 1) {
    return "Seleção mantida: 1 município";
  }
  return `Seleção mantida: ${count} municípios`;
}

/**
 * Pure reducer for selection state.
 *
 * @param {SelectionState} state
 * @param {SelectionAction} action
 * @returns {SelectionState}
 */
export function reduceSelection(state, action) {
  if (action.type === SELECTION_TOGGLED) {
    return handleToggleMunicipality(state, /** @type {ToggleMunicipalityAction} */ (action));
  }
  if (action.type === SELECTION_REGION_TOGGLED) {
    return handleToggleRegion(state, /** @type {ToggleRegionAction} */ (action));
  }
  if (action.type === SELECTION_GOVERNMENT_REGION_TOGGLED) {
    return handleToggleGovernmentRegion(state, /** @type {any} */ (action));
  }
  if (action.type === SELECTION_GOVERNMENT_REGION_ADDED) {
    const added = /** @type {AddGovernmentRegionAction} */ (action);
    return {
      selectedCodes: addGovernmentRegion(
        [...state.selectedCodes],
        added.territory,
        added.governmentRegionCode,
      ),
      selectedClassIndex: null,
      retentionNotice: null,
    };
  }
  if (action.type === SELECTION_REGION_ADDED) {
    return handleAddRegion(state, /** @type {AddRegionAction} */ (action));
  }
  if (action.type === SELECTION_CLASS_CHOSEN) {
    return handleSelectClass(state, /** @type {SelectClassAction} */ (action));
  }
  if (action.type === SELECTION_UNIT_REMOVED) {
    return handleRemoveCodes(state, /** @type {RemoveCodesAction} */ (action));
  }
  if (action.type === SELECTION_CLEARED) {
    return handleClear(state);
  }
  if (action.type === SELECTION_NOTICE_SET) {
    return handleSetNotice(state, /** @type {SetNoticeAction} */ (action));
  }
  if (action.type === SELECTION_NOTICE_CLEARED) {
    return handleClearNotice(state);
  }
  return state;
}

/**
 * @param {SelectionState} state
 * @param {ToggleMunicipalityAction} action
 * @returns {SelectionState}
 */
function handleToggleMunicipality(state, action) {
  const nextCodes = toggleMunicipality([...state.selectedCodes], action.code);
  return {
    selectedCodes: nextCodes,
    selectedClassIndex: null,
    retentionNotice: null,
  };
}

/**
 * @param {SelectionState} state
 * @param {ToggleRegionAction} action
 * @returns {SelectionState}
 */
function handleToggleRegion(state, action) {
  const nextCodes = toggleRegion([...state.selectedCodes], action.territory, action.regionCode);
  return {
    selectedCodes: nextCodes,
    selectedClassIndex: null,
    retentionNotice: null,
  };
}

/**
 * @param {SelectionState} state
 * @param {{ type: string, governmentRegionCode: string, territory: TerritoryIndex }} action
 * @returns {SelectionState}
 */
function handleToggleGovernmentRegion(state, action) {
  const nextCodes = toggleGovernmentRegion(
    [...state.selectedCodes],
    action.territory,
    action.governmentRegionCode,
  );
  return {
    selectedCodes: nextCodes,
    selectedClassIndex: null,
    retentionNotice: null,
  };
}

/**
 * @param {SelectionState} state
 * @param {AddRegionAction} action
 * @returns {SelectionState}
 */
function handleAddRegion(state, action) {
  const nextCodes = addRegion([...state.selectedCodes], action.territory, action.regionCode);
  return {
    selectedCodes: nextCodes,
    selectedClassIndex: null,
    retentionNotice: null,
  };
}

/**
 * @param {SelectionState} state
 * @param {SelectClassAction} action
 * @returns {SelectionState}
 */
function handleSelectClass(state, action) {
  if (action.classIndex === null) {
    return {
      selectedCodes: [],
      selectedClassIndex: null,
      retentionNotice: null,
    };
  }
  const nextCodes = selectByClassIndex(
    [...state.selectedCodes],
    action.classIndexByCode,
    action.classIndex,
  );
  return {
    selectedCodes: nextCodes,
    selectedClassIndex: action.classIndex,
    retentionNotice: null,
  };
}

/**
 * @param {SelectionState} state
 * @param {RemoveCodesAction} action
 * @returns {SelectionState}
 */
function handleRemoveCodes(state, action) {
  const removeSet = new Set(action.codes);
  const nextCodes = state.selectedCodes.filter((code) => !removeSet.has(code));
  return {
    selectedCodes: nextCodes,
    selectedClassIndex: null,
    retentionNotice: null,
  };
}

/**
 * @param {SelectionState} state
 * @returns {SelectionState}
 */
function handleClear(state) {
  if (state.selectedCodes.length === 0 && state.selectedClassIndex === null) {
    return state;
  }
  return {
    selectedCodes: [],
    selectedClassIndex: null,
    retentionNotice: null,
  };
}

/**
 * @param {SelectionState} state
 * @param {SetNoticeAction} action
 * @returns {SelectionState}
 */
function handleSetNotice(state, action) {
  return {
    ...state,
    retentionNotice: action.notice,
  };
}

/**
 * @param {SelectionState} state
 * @returns {SelectionState}
 */
function handleClearNotice(state) {
  if (state.retentionNotice === null) {
    return state;
  }
  return {
    ...state,
    retentionNotice: null,
  };
}

/**
 * @param {SelectionState} state
 * @returns {readonly string[]}
 */
export function selectSelectedCodes(state) {
  return state.selectedCodes;
}

/**
 * @param {SelectionState} state
 * @returns {boolean}
 */
export function selectIsSelectionEmpty(state) {
  return state.selectedCodes.length === 0;
}

/**
 * @param {SelectionState} state
 * @returns {number | null}
 */
export function selectSelectedClassIndex(state) {
  return state.selectedClassIndex;
}

/**
 * @param {SelectionState} state
 * @returns {string | null}
 */
export function selectRetentionNotice(state) {
  return state.retentionNotice;
}

/** @param {string} governmentRegionCode
 * @param {TerritoryIndex} territory
 * @returns {AddGovernmentRegionAction} */
export function addGovernmentRegionAction(governmentRegionCode, territory) {
  return { type: SELECTION_GOVERNMENT_REGION_ADDED, governmentRegionCode, territory };
}
