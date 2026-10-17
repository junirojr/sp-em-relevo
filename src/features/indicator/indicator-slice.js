import { DEFAULT_INDICATOR_ID, findIndicator } from "../../domain/indicator.js";

export { DEFAULT_INDICATOR_ID };

/**
 * Indicator selection slice: handles switching between socio-economic and demographic indicators.
 * Follows IND-01, IND-02, IND-03 and IND-04.
 *
 * @typedef {"population" | "area" | "density" | "gdpPerCapita"} IndicatorId
 * @typedef {{ id: IndicatorId }} IndicatorState
 * @typedef {{ type: "indicator/changed", id: IndicatorId }} IndicatorChangedAction
 * @typedef {IndicatorChangedAction | { type: string }} IndicatorAction
 */

export const INDICATOR_CHANGED = "indicator/changed";

/** @type {readonly IndicatorId[]} */
export const INDICATOR_IDS = ["population", "area", "density", "gdpPerCapita"];

export const INDICATOR_OPTIONS = [
  { id: "population", label: "População" },
  { id: "area", label: "Área" },
  { id: "density", label: "Densidade demográfica" },
  { id: "gdpPerCapita", label: "PIB per capita" },
];

/**
 * @param {IndicatorId} [initialId]
 * @returns {IndicatorState}
 */
export function createIndicatorState(initialId = DEFAULT_INDICATOR_ID) {
  if (isValidIndicator(initialId)) {
    return { id: initialId };
  }
  return { id: DEFAULT_INDICATOR_ID };
}

/**
 * @param {IndicatorId} id
 * @returns {IndicatorChangedAction}
 */
export function changeIndicator(id) {
  return {
    type: INDICATOR_CHANGED,
    id,
  };
}

/**
 * Pure reducer for selected indicator.
 *
 * @param {IndicatorState} state
 * @param {IndicatorAction} action
 * @returns {IndicatorState}
 */
export function reduceIndicator(state, action) {
  if (action.type !== INDICATOR_CHANGED) {
    return state;
  }
  const indicatorAction = /** @type {IndicatorChangedAction} */ (action);
  if (!isValidIndicator(indicatorAction.id)) {
    return state;
  }
  if (state.id === indicatorAction.id) {
    return state;
  }
  return { id: indicatorAction.id };
}

/**
 * @param {string} id
 * @returns {id is IndicatorId}
 */
export function isValidIndicator(id) {
  return INDICATOR_IDS.includes(/** @type {IndicatorId} */ (id));
}

/**
 * @param {IndicatorState} state
 * @returns {IndicatorId}
 */
export function selectIndicatorId(state) {
  return state.id;
}

/**
 * Looks up the definition of the chosen indicator in the domain catalog.
 *
 * @param {IndicatorState} state
 * @returns {import("../../domain/indicator.js").IndicatorDefinition}
 */
export function selectIndicatorDefinition(state) {
  return findIndicator(state.id);
}
