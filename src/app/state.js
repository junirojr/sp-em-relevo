import { createDemoState, reduceDemo } from "../features/demo/demo-slice.js";
import { createIndicatorState, reduceIndicator } from "../features/indicator/indicator-slice.js";
import { createLevelState, reduceLevel } from "../features/level/level-slice.js";
import {
  createSelectionState,
  formatRetentionNotice,
  reduceSelection,
} from "../features/selection/selection-slice.js";
import { createSettingsState, reduceSettings } from "../features/settings/settings-slice.js";
import { DEFAULT_STATUS, normalizeStatus } from "./data-loader.js";

/**
 * The root state keeps intent only: active tab, operational status, indicator, level,
 * selected codes, pointed/inspected unit and settings.
 * Current height, elevation, tilt, drag and the pointer screen position live in the engine.
 *
 * @typedef {import("../domain/territory.js").MunicipalityRecord} MunicipalityRecord
 * @typedef {import("../domain/territory.js").RegionRecord} RegionRecord
 * @typedef {{
 *   municipalities: MunicipalityRecord[],
 *   regions: RegionRecord[],
 *   governmentRegions?: RegionRecord[]
 * }} LoadedData
 *   Municipality order is the engine instance order.
 * @typedef {"indicators" | "first-round" | "second-round"} TabId
 * @typedef {"indicator" | "election"} ModeAttribute
 * @typedef {import("./data-loader.js").OperationalStatus} OperationalStatus
 * @typedef {import("../features/indicator/indicator-slice.js").IndicatorState} IndicatorState
 * @typedef {import("../features/level/level-slice.js").LevelId} LevelId
 * @typedef {import("../features/level/level-slice.js").LevelState} LevelState
 * @typedef {import("../features/selection/selection-slice.js").SelectionState} SelectionState
 * @typedef {{ pointedCode: string | null, inspectedCode: string | null }} PointerState
 *   code of the unit under the pointer (`pointedCode`) and unit inspected by touch (`inspectedCode`, E33).
 * @typedef {import("../features/settings/settings-slice.js").SettingsState} SettingsState
 * @typedef {{ indicator: IndicatorState }} RestorePoint
 *   What turning the demo off puts back: the real indicator picked before turning the demo on.
 *   The selection and the level picked during the demo stay (DEM-04).
 * @typedef {import("../features/demo/demo-slice.js").DemoState & {
 *   restore: RestorePoint | null
 * }} DemoState
 * @typedef {{
 *   data: LoadedData,
 *   tab: TabId,
 *   status: OperationalStatus,
 *   indicator: IndicatorState,
 *   level: LevelState,
 *   selection: SelectionState,
 *   pointer: PointerState,
 *   settings: SettingsState,
 *   demo: DemoState
 * }} RootState
 * @typedef {{ type: string }} Action
 * @typedef {{ type: "pointer/pointedUnitChanged", code: string | null }} PointedUnitChangedAction
 * @typedef {{ type: "pointer/inspectedUnitChanged", code: string | null }} InspectedUnitChangedAction
 * @typedef {{ type: "app/tabChanged", tab: TabId }} TabChangedAction
 * @typedef {{ type: "app/statusChanged", status: OperationalStatus }} StatusChangedAction
 */

export const POINTED_UNIT_CHANGED = "pointer/pointedUnitChanged";
export const INSPECTED_UNIT_CHANGED = "pointer/inspectedUnitChanged";
export const TAB_CHANGED = "app/tabChanged";
export const STATUS_CHANGED = "app/statusChanged";

export const VALID_TABS = Object.freeze(["indicators", "first-round", "second-round"]);

/** @type {ReadonlyArray<keyof RootState>} */
const ROOT_STATE_KEYS = [
  "data",
  "tab",
  "status",
  "indicator",
  "level",
  "selection",
  "pointer",
  "settings",
  "demo",
];

/**
 * @param {LoadedData} data
 * @param {{
 *   indicatorId?: string,
 *   levelId?: string,
 *   tab?: string,
 *   status?: unknown
 * }} [initialOptions]
 * @returns {RootState}
 */
export function createInitialState(data, initialOptions = {}) {
  const initialIndicatorId = /** @type {any} */ (initialOptions.indicatorId);
  const status = resolveInitialStatus(initialOptions.status);
  const initialLevelId = resolveInitialLevelId(initialOptions.levelId, status);
  const initialTab = resolveAllowedTab(initialOptions.tab, status);

  return {
    data,
    tab: initialTab,
    status,
    indicator: createIndicatorState(initialIndicatorId),
    level: createLevelState(initialLevelId),
    selection: createSelectionState(),
    pointer: { pointedCode: null, inspectedCode: null },
    settings: createSettingsState(),
    demo: { ...createDemoState(), restore: null },
  };
}

/**
 * @param {unknown} rawStatus
 * @returns {OperationalStatus}
 */
function resolveInitialStatus(rawStatus) {
  if (!rawStatus) {
    return DEFAULT_STATUS;
  }
  return normalizeStatus(rawStatus);
}

/**
 * @param {string | undefined} requestedLevelId
 * @param {OperationalStatus} status
 * @returns {LevelId}
 */
function resolveInitialLevelId(requestedLevelId, status) {
  if (requestedLevelId === "region") {
    return "region";
  }
  if (requestedLevelId === "governmentRegion" && status.features.levelGovernmentRegion !== false) {
    return /** @type {LevelId} */ ("governmentRegion");
  }
  return "municipality";
}

/**
 * @param {unknown} requestedTab
 * @param {OperationalStatus} status
 * @returns {TabId}
 */
export function resolveAllowedTab(requestedTab, status = DEFAULT_STATUS) {
  const normalizedTab = normalizeTabId(requestedTab);
  if (normalizedTab === "indicators") {
    return "indicators";
  }
  const features = status?.features ?? DEFAULT_STATUS.features;
  if (!features.election || status?.mode === "disabled") {
    return "indicators";
  }
  if (normalizedTab === "second-round" && !features.electionSecondRound) {
    return "first-round";
  }
  return normalizedTab;
}

/**
 * @param {unknown} value
 * @returns {TabId}
 */
export function normalizeTabId(value) {
  if (value === "first-round" || value === "second-round" || value === "indicators") {
    return value;
  }
  return "indicators";
}

/**
 * Reads the root `data-mode` attribute value for `document.documentElement` (ELE-16, ELE-23).
 *
 * @param {Pick<RootState, "tab"> | null | undefined} state
 * @returns {ModeAttribute}
 */
export function readModeAttribute(state) {
  if (state?.tab === "first-round" || state?.tab === "second-round") {
    return "election";
  }
  return "indicator";
}

/**
 * Runs every slice reducer. When no slice changes, returns the same root reference, so the store
 * notifies nobody and memoized selectors keep their results.
 *
 * @param {RootState} state
 * @param {Action} action
 * @returns {RootState}
 */
export function reduceRootState(state, action) {
  const nextStatus = reduceStatus(state.status, action);
  const nextTab = reduceTab(state.tab, nextStatus, action);
  const nextIndicator = reduceIndicatorUnlessDemo(state, action);
  let nextSelection = reduceSelection(state.selection, action);
  if (nextIndicator !== state.indicator && state.selection.selectedCodes.length > 0) {
    nextSelection = {
      ...state.selection,
      selectedClassIndex: null,
      retentionNotice: formatRetentionNotice(state.selection.selectedCodes.length),
    };
  }
  const reducedState = {
    ...state,
    tab: nextTab,
    status: nextStatus,
    indicator: nextIndicator,
    level: reduceLevel(state.level, action),
    selection: nextSelection,
    pointer: reducePointer(state.pointer, action),
    settings: reduceSettings(state.settings, action),
    demo: reduceDemoSlice(state.demo, action),
  };
  const nextState = applyDemoTransition(state, reducedState);
  if (keepsEverySlice(state, nextState)) {
    return state;
  }
  return nextState;
}

/**
 * @param {OperationalStatus} status
 * @param {Action} action
 * @returns {OperationalStatus}
 */
function reduceStatus(status, action) {
  if (action.type !== STATUS_CHANGED) {
    return status;
  }
  const statusAction = /** @type {StatusChangedAction} */ (action);
  return normalizeStatus(statusAction.status);
}

/**
 * @param {TabId} tab
 * @param {OperationalStatus} status
 * @param {Action} action
 * @returns {TabId}
 */
function reduceTab(tab, status, action) {
  if (action.type === TAB_CHANGED) {
    const tabAction = /** @type {TabChangedAction} */ (action);
    return resolveAllowedTab(tabAction.tab, status);
  }
  return resolveAllowedTab(tab, status);
}

/**
 * The demo has a single indicator, so the real indicator stays frozen while it is on.
 *
 * @param {RootState} state
 * @param {Action} action
 * @returns {IndicatorState}
 */
function reduceIndicatorUnlessDemo(state, action) {
  if (state.demo.isActive) {
    return state.indicator;
  }
  return reduceIndicator(state.indicator, action);
}

/**
 * Runs the demo reducer on the slice fields and keeps the restore point beside them.
 *
 * @param {DemoState} demo
 * @param {Action} action
 * @returns {DemoState}
 */
function reduceDemoSlice(demo, action) {
  const slice = { isActive: demo.isActive, drawNumber: demo.drawNumber };
  const nextSlice = reduceDemo(slice, action);
  if (nextSlice === slice) {
    return demo;
  }
  return { ...nextSlice, restore: demo.restore };
}

/**
 * Turning the demo on saves the real indicator; turning it off puts it back. The selection and the
 * level picked during the demo stay, only the class filter goes, since it was bound to the
 * synthetic scale.
 *
 * @param {RootState} state
 * @param {RootState} nextState
 * @returns {RootState}
 */
function applyDemoTransition(state, nextState) {
  if (!state.demo.isActive && nextState.demo.isActive) {
    return enterDemo(state, nextState);
  }
  if (state.demo.isActive && !nextState.demo.isActive) {
    return leaveDemo(nextState);
  }
  return nextState;
}

/**
 * Class filters are bound to the real scale, so the synthetic scale starts without one.
 *
 * @param {RootState} state
 * @param {RootState} nextState
 * @returns {RootState}
 */
function enterDemo(state, nextState) {
  const restore = { indicator: state.indicator };
  return {
    ...nextState,
    selection: clearClassFilter(nextState.selection),
    demo: { ...nextState.demo, restore },
  };
}

/**
 * @param {RootState} nextState
 * @returns {RootState}
 */
function leaveDemo(nextState) {
  const restore = nextState.demo.restore;
  if (restore === null) {
    return nextState;
  }
  return {
    ...nextState,
    indicator: restore.indicator,
    selection: clearClassFilter(nextState.selection),
    demo: { ...nextState.demo, restore: null },
  };
}

/**
 * @param {SelectionState} selection
 * @returns {SelectionState}
 */
function clearClassFilter(selection) {
  if (selection.selectedClassIndex === null) {
    return selection;
  }
  return { ...selection, selectedClassIndex: null };
}

/**
 * Builds the action the engine pointer callback dispatches; `null` means no unit is pointed.
 *
 * @param {string | null} code
 * @returns {PointedUnitChangedAction}
 */
export function changePointedUnit(code) {
  return { type: POINTED_UNIT_CHANGED, code };
}

/**
 * Builds the action dispatched when a unit is inspected via touch without selecting it (E33).
 *
 * @param {string | null} code
 * @returns {InspectedUnitChangedAction}
 */
export function changeInspectedUnit(code) {
  return { type: INSPECTED_UNIT_CHANGED, code };
}

/**
 * Builds the action to switch the active application tab (ELE-17, ELE-20).
 *
 * @param {TabId} tab
 * @returns {TabChangedAction}
 */
export function changeTab(tab) {
  return { type: TAB_CHANGED, tab };
}

/**
 * Builds the action to update the operational status configuration (FLG-01, FLG-02).
 *
 * @param {OperationalStatus} status
 * @returns {StatusChangedAction}
 */
export function changeStatus(status) {
  return { type: STATUS_CHANGED, status };
}

/**
 * @param {PointerState} pointer
 * @param {Action} action
 * @returns {PointerState}
 */
function reducePointer(pointer, action) {
  if (isPointedUnitChange(action)) {
    if (action.code === pointer.pointedCode) {
      return pointer;
    }
    return { ...pointer, pointedCode: action.code };
  }
  if (isInspectedUnitChange(action)) {
    if (action.code === pointer.inspectedCode) {
      return pointer;
    }
    return { ...pointer, inspectedCode: action.code };
  }
  return pointer;
}

/**
 * @param {Action} action
 * @returns {action is PointedUnitChangedAction}
 */
function isPointedUnitChange(action) {
  return action.type === POINTED_UNIT_CHANGED;
}

/**
 * @param {Action} action
 * @returns {action is InspectedUnitChangedAction}
 */
function isInspectedUnitChange(action) {
  return action.type === INSPECTED_UNIT_CHANGED;
}

/**
 * @param {RootState} state
 * @param {RootState} nextState
 */
function keepsEverySlice(state, nextState) {
  return ROOT_STATE_KEYS.every((key) => state[key] === nextState[key]);
}
