import { createDemoState, reduceDemo } from "../features/demo/demo-slice.js";
import { createIndicatorState, reduceIndicator } from "../features/indicator/indicator-slice.js";
import { createLevelState, reduceLevel } from "../features/level/level-slice.js";
import {
  createSelectionState,
  formatRetentionNotice,
  reduceSelection,
} from "../features/selection/selection-slice.js";
import { createSettingsState, reduceSettings } from "../features/settings/settings-slice.js";

/**
 * The root state keeps intent only: indicator, level, selected codes, pointed unit and settings.
 * Current height, elevation, tilt, drag and the pointer screen position live in the engine.
 *
 * @typedef {import("../domain/territory.js").MunicipalityRecord} MunicipalityRecord
 * @typedef {import("../domain/territory.js").RegionRecord} RegionRecord
 * @typedef {{ municipalities: MunicipalityRecord[], regions: RegionRecord[] }} LoadedData
 *   Municipality order is the engine instance order.
 * @typedef {import("../features/indicator/indicator-slice.js").IndicatorState} IndicatorState
 * @typedef {import("../features/level/level-slice.js").LevelId} LevelId
 * @typedef {import("../features/level/level-slice.js").LevelState} LevelState
 * @typedef {import("../features/selection/selection-slice.js").SelectionState} SelectionState
 * @typedef {{ pointedCode: string | null }} PointerState code of the unit under the pointer.
 * @typedef {import("../features/settings/settings-slice.js").SettingsState} SettingsState
 * @typedef {{ indicator: IndicatorState }} RestorePoint
 *   What turning the demo off puts back: the real indicator picked before turning the demo on.
 *   The selection and the level picked during the demo stay (DEM-04).
 * @typedef {import("../features/demo/demo-slice.js").DemoState & {
 *   restore: RestorePoint | null
 * }} DemoState
 * @typedef {{
 *   data: LoadedData,
 *   indicator: IndicatorState,
 *   level: LevelState,
 *   selection: SelectionState,
 *   pointer: PointerState,
 *   settings: SettingsState,
 *   demo: DemoState
 * }} RootState
 * @typedef {{ type: string }} Action
 * @typedef {{ type: "pointer/pointedUnitChanged", code: string | null }} PointedUnitChangedAction
 */

export const POINTED_UNIT_CHANGED = "pointer/pointedUnitChanged";

/** @type {ReadonlyArray<keyof RootState>} */
const ROOT_STATE_KEYS = ["data", "indicator", "level", "selection", "pointer", "settings", "demo"];

/**
 * @param {LoadedData} data
 * @param {{ indicatorId?: string, levelId?: string }} [initialOptions]
 * @returns {RootState}
 */
export function createInitialState(data, initialOptions = {}) {
  const initialIndicatorId = /** @type {any} */ (initialOptions.indicatorId);
  /** @type {LevelId} */
  let initialLevelId = "municipality";
  if (initialOptions.levelId === "region") {
    initialLevelId = "region";
  }
  return {
    data,
    indicator: createIndicatorState(initialIndicatorId),
    level: createLevelState(initialLevelId),
    selection: createSelectionState(),
    pointer: { pointedCode: null },
    settings: createSettingsState(),
    demo: { ...createDemoState(), restore: null },
  };
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
 * @param {PointerState} pointer
 * @param {Action} action
 * @returns {PointerState}
 */
function reducePointer(pointer, action) {
  if (!isPointedUnitChange(action)) {
    return pointer;
  }
  if (action.code === pointer.pointedCode) {
    return pointer;
  }
  return { pointedCode: action.code };
}

/**
 * @param {Action} action
 * @returns {action is PointedUnitChangedAction}
 */
function isPointedUnitChange(action) {
  return action.type === POINTED_UNIT_CHANGED;
}

/**
 * @param {RootState} state
 * @param {RootState} nextState
 */
function keepsEverySlice(state, nextState) {
  return ROOT_STATE_KEYS.every((key) => state[key] === nextState[key]);
}
