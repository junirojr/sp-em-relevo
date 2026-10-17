import { SYNTHETIC_INDICATOR } from "../../domain/synthetic.js";

/**
 * @typedef {{
 *   isActive: boolean,
 *   drawNumber: number
 * }} DemoState
 *
 * @typedef {{ type: "demo/enabled", drawNumber: number }} DemoEnabledAction
 * @typedef {{ type: "demo/disabled" }} DemoDisabledAction
 * @typedef {{ type: "demo/drawChanged", drawNumber: number }} DemoDrawChangedAction
 * @typedef {DemoEnabledAction | DemoDisabledAction | DemoDrawChangedAction | { type: string }} DemoAction
 */

export const DEMO_ENABLED = "demo/enabled";
export const DEMO_DISABLED = "demo/disabled";
export const DEMO_DRAW_CHANGED = "demo/drawChanged";

export const MIN_DRAW_NUMBER = 1;
export const MAX_DRAW_NUMBER = 99999;
export const DEFAULT_DRAW_NUMBER = 10;
export const DISABLED_INDICATOR_REASON = "Dado sintético ativo";

/**
 * @returns {DemoState}
 */
export function createDemoState() {
  return {
    isActive: false,
    drawNumber: DEFAULT_DRAW_NUMBER,
  };
}

/**
 * @param {number} drawNumber
 * @returns {DemoEnabledAction}
 */
export function enableDemo(drawNumber) {
  return {
    type: DEMO_ENABLED,
    drawNumber,
  };
}

/**
 * @returns {DemoDisabledAction}
 */
export function disableDemo() {
  return {
    type: DEMO_DISABLED,
  };
}

/**
 * @param {number} drawNumber
 * @returns {DemoDrawChangedAction}
 */
export function changeDrawNumber(drawNumber) {
  return {
    type: DEMO_DRAW_CHANGED,
    drawNumber,
  };
}

/**
 * Pure reducer for the demo slice.
 *
 * @param {DemoState} state
 * @param {DemoAction} action
 * @returns {DemoState}
 */
export function reduceDemo(state, action) {
  if (action.type === DEMO_ENABLED) {
    return handleEnable(state, /** @type {DemoEnabledAction} */ (action));
  }
  if (action.type === DEMO_DISABLED) {
    return handleDisable(state);
  }
  if (action.type === DEMO_DRAW_CHANGED) {
    return handleDrawChanged(state, /** @type {DemoDrawChangedAction} */ (action));
  }
  return state;
}

/**
 * @param {DemoState} state
 * @param {DemoEnabledAction} action
 * @returns {DemoState}
 */
function handleEnable(state, action) {
  const normalized = normalizeDrawNumber(action.drawNumber);
  const drawNumber = readFallbackDraw(normalized, state.drawNumber);
  if (state.isActive && state.drawNumber === drawNumber) {
    return state;
  }
  return {
    isActive: true,
    drawNumber,
  };
}

/**
 * @param {DemoState} state
 * @returns {DemoState}
 */
function handleDisable(state) {
  if (!state.isActive) {
    return state;
  }
  return {
    ...state,
    isActive: false,
  };
}

/**
 * @param {DemoState} state
 * @param {DemoDrawChangedAction} action
 * @returns {DemoState}
 */
function handleDrawChanged(state, action) {
  const normalized = normalizeDrawNumber(action.drawNumber);
  if (normalized === null) {
    return state;
  }
  if (state.drawNumber === normalized) {
    return state;
  }
  return {
    ...state,
    drawNumber: normalized,
  };
}

/**
 * @param {number | null} candidate
 * @param {number} fallback
 * @returns {number}
 */
function readFallbackDraw(candidate, fallback) {
  if (candidate === null) {
    return fallback;
  }
  return candidate;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function normalizeDrawNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  const integer = Math.trunc(value);
  if (integer < MIN_DRAW_NUMBER || integer > MAX_DRAW_NUMBER) {
    return null;
  }
  return integer;
}

/**
 * Generates an integer between 1 and 99999.
 *
 * @returns {number}
 */
export function pickRandomDrawNumber() {
  const range = MAX_DRAW_NUMBER - MIN_DRAW_NUMBER + 1;
  return Math.floor(Math.random() * range) + MIN_DRAW_NUMBER;
}

/**
 * @param {DemoState} state
 * @returns {boolean}
 */
export function selectIsDemoActive(state) {
  return state.isActive;
}

/**
 * @param {DemoState} state
 * @returns {number}
 */
export function selectDrawNumber(state) {
  return state.drawNumber;
}

/**
 * @param {DemoState} state
 * @returns {import("../../domain/synthetic.js").SyntheticIndicator | null}
 */
export function selectDemoIndicator(state) {
  if (!state.isActive) {
    return null;
  }
  return SYNTHETIC_INDICATOR;
}

/**
 * @param {DemoState} state
 * @returns {string | null}
 */
export function selectDisabledIndicatorReason(state) {
  if (!state.isActive) {
    return null;
  }
  return DISABLED_INDICATOR_REASON;
}
