import { changeLevel, LEVEL_OPTIONS } from "./level-slice.js";

/**
 * @typedef {import("./level-slice.js").LevelId} LevelId
 * @typedef {import("./level-slice.js").LevelState} LevelState
 * @typedef {{ type: string }} Action
 *
 * @typedef {{
 *   title: string,
 *   currentLevelId: LevelId,
 *   options: typeof LEVEL_OPTIONS
 * }} LevelViewModel
 */

const TITLE = "Ver por";

/**
 * Pure rule: builds view model for the level selection fieldset.
 *
 * @param {LevelState} state
 * @returns {LevelViewModel}
 */
export function buildLevelViewModel(state) {
  return {
    title: TITLE,
    currentLevelId: state.id,
    options: LEVEL_OPTIONS,
  };
}

/**
 * Mounts the native radio group for level selection.
 *
 * @param {Document} documentRef
 * @param {(action: Action) => void} dispatch
 */
export function mountLevelView(documentRef, dispatch) {
  const fieldset = documentRef.createElement("fieldset");
  fieldset.className = "level-fieldset";

  const legend = documentRef.createElement("legend");
  legend.className = "level-legend";
  legend.textContent = TITLE;
  fieldset.append(legend);

  /** @type {HTMLInputElement[]} */
  const inputs = [];

  for (let i = 0; i < LEVEL_OPTIONS.length; i += 1) {
    const option = LEVEL_OPTIONS[i];
    const label = documentRef.createElement("label");
    label.className = "level-choice";

    const input = documentRef.createElement("input");
    input.type = "radio";
    input.name = "level";
    input.value = option.id;
    input.autocomplete = "off";

    input.addEventListener("change", () => {
      if (input.checked) {
        dispatch(changeLevel(/** @type {LevelId} */ (input.value)));
      }
    });

    label.append(input, documentRef.createTextNode(option.label));
    fieldset.append(label);
    inputs.push(input);
  }

  return {
    element: fieldset,
    update: (/** @type {LevelState} */ state) => {
      for (let i = 0; i < inputs.length; i += 1) {
        inputs[i].checked = inputs[i].value === state.id;
      }
    },
  };
}
