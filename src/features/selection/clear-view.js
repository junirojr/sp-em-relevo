import { clearSelectionAction } from "./selection-slice.js";

/**
 * @typedef {import("./selection-slice.js").SelectionState} SelectionState
 * @typedef {{ type: string }} Action
 *
 * @typedef {{
 *   isDisabled: boolean
 * }} ClearViewModel
 *
 * @typedef {{
 *   onResetView?: () => void
 * }} ClearViewOptions
 */

const CLEAR_BUTTON_TEXT = "Limpar";

/**
 * Pure rule: builds view model for the Clear button.
 * Disabled when selection is empty.
 * Follows SEL-10.
 *
 * @param {SelectionState} state
 * @returns {ClearViewModel}
 */
export function buildClearViewModel(state) {
  return {
    isDisabled: state.selectedCodes.length === 0,
  };
}

/**
 * Mounts the Clear button.
 *
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 * @param {ClearViewOptions} [options]
 */
export function mountClearView(documentRef, dispatch, options = {}) {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.id = "clear-selection";
  button.className = "action action-clear";
  button.textContent = CLEAR_BUTTON_TEXT;
  button.disabled = true;

  button.addEventListener("click", () => {
    dispatch(clearSelectionAction());
    if (options.onResetView) {
      options.onResetView();
    }
  });

  return {
    element: button,
    update: (/** @type {SelectionState} */ state) => {
      const model = buildClearViewModel(state);
      button.disabled = model.isDisabled;
    },
  };
}
